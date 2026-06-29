import type { SupabaseClient } from "@supabase/supabase-js";
import { hasPermission } from "@/lib/admin/permissions";
import {
  computeRunway,
  endOfMonthISO,
  summarizePledges,
} from "@/lib/finance/runway";
import { loadRevenueSchedule, scheduleToRunwayPledges } from "@/lib/finance/schedule";
import type { ReedTool } from "./client";
import { EXCLUDE_PARTNERSHIP_OPPS } from "@/lib/hubspot/stage-map";
import { loadConstituentDossier, loadMeetingBrief, loadPartnerDossier } from "@/lib/meetings/dossier";

/**
 * Reed's read-only tool set (Phase 4).
 *
 * Every tool: (1) runs on the SESSION client passed in, so RLS scopes the data
 * to the asking user; (2) is internally gated by the matching has_permission, so
 * a user without finance.read gets a clean refusal rather than an empty result;
 * (3) returns REAL query output — Reed narrates these numbers, it never computes
 * them itself. The money formulas are copied verbatim from the locked sources
 * (lib/admin/finance.ts getFinanceSnapshot, lib/admin/overview/sources.ts
 * getForecast) so Reed's numbers match the deterministic dashboards by
 * construction. Those sources hardcode the service-role client, which Reed may
 * never use — hence the deliberate re-implementation on the session client.
 *
 * The forward-runway math is shared, not copied: both this module and the
 * admin snapshot import computeRunway/summarizePledges from lib/finance/runway
 * (a pure, DB-free module), so the three runway tiers can't drift between Reed
 * and the dashboard. If you change a still-copied formula, change it here too.
 */

// Copied from lib/admin/finance.ts (pure; not imported, to keep this module free
// of any transitive service-role-client import).
function fiscalYearBounds(year: number, startMonth: number): { start: string; end: string } {
  if (startMonth === 1) return { start: `${year}-01-01`, end: `${year}-12-31` };
  const sm = String(startMonth).padStart(2, "0");
  const lastDay = new Date(year, startMonth - 1, 0).getDate();
  const em = String(startMonth - 1).padStart(2, "0");
  return { start: `${year - 1}-${sm}-01`, end: `${year}-${em}-${String(lastDay).padStart(2, "0")}` };
}

const OPEN_STAGES = ["identify", "qualify", "cultivate", "solicit"];

const round2 = (n: number) => Math.round(n * 100) / 100;

type Denied = { error: "permission_denied"; message: string };
const deny = (perm: string): Denied => ({
  error: "permission_denied",
  message: `The asking user does not have ${perm} access, so this data can't be shown.`,
});

async function loadFinConfig(sb: SupabaseClient) {
  const { data } = await sb
    .from("fin_config")
    .select(
      "current_year, fiscal_year_start_month, fundraising_goal, cash_starting_balance, cash_starting_date, cash_reconciled_at, monthly_burn_baseline, forward_horizon_months",
    )
    .eq("id", 1)
    .maybeSingle();
  return {
    year: typeof data?.current_year === "number" ? data.current_year : new Date().getFullYear(),
    startMonth: typeof data?.fiscal_year_start_month === "number" ? data.fiscal_year_start_month : 1,
    goal: Number(data?.fundraising_goal ?? 0),
    startBal: Number(data?.cash_starting_balance ?? 0),
    startDate: (data?.cash_starting_date as string | null) ?? null,
    reconciledAt: (data?.cash_reconciled_at as string | null) ?? null,
    baseline:
      data?.monthly_burn_baseline === null || data?.monthly_burn_baseline === undefined
        ? null
        : Number(data.monthly_burn_baseline),
    horizon: typeof data?.forward_horizon_months === "number" ? data.forward_horizon_months : 3,
  };
}

// Each draftable kind carries the write permission its data domain requires.
const DRAFT_PERMISSION: Record<string, string> = {
  grant_narrative: "fundraising.write",
  acknowledgment: "fundraising.write",
  board_update: "board.write",
  strategy_review: "org.manage",
};

type PlanRow = Record<string, unknown>;
type Plan = {
  objectives: PlanRow[];
  goals: PlanRow[];
  initiatives: PlanRow[];
  kpis: PlanRow[];
  review: PlanRow | null;
};

// Load the OGSM tree (session client, RLS-scoped). Shared by the strategy tools.
async function loadPlan(sb: SupabaseClient, orgId: string): Promise<Plan> {
  const [obj, goal, init, kpi, rev] = await Promise.all([
    sb.from("plan_objectives").select("id, title, three_year_statement, owner, status, sort_order").eq("org_id", orgId).order("sort_order"),
    sb.from("plan_goals").select("id, objective_id, title, target_date, owner, status, sort_order").eq("org_id", orgId).order("sort_order"),
    sb.from("plan_initiatives").select("id, goal_id, title, owner, status, sort_order").eq("org_id", orgId).order("sort_order"),
    sb.from("plan_kpis").select("id, goal_id, objective_id, title, unit, target, current, owner, cadence, source, metric_key, status").eq("org_id", orgId),
    sb.from("plan_reviews").select("conducted_at, next_review_at").eq("org_id", orgId).order("conducted_at", { ascending: false }).limit(1),
  ]);
  return {
    objectives: obj.data ?? [],
    goals: goal.data ?? [],
    initiatives: init.data ?? [],
    kpis: kpi.data ?? [],
    review: (rev.data ?? [])[0] ?? null,
  };
}

const S = (r: PlanRow, k: string): string => (typeof r[k] === "string" ? (r[k] as string) : "");
const missing = (r: PlanRow, k: string): boolean => r[k] == null || r[k] === "";

/**
 * Build the tool registry bound to one request's session client + org. Each
 * tool closes over `sb` (RLS-scoped) and checks `orgId` permissions. `createdBy`
 * stamps any drafts Reed saves.
 */
export function buildReedTools(sb: SupabaseClient, orgId: string, createdBy: string): ReedTool[] {
  return [
    {
      name: "get_finance_snapshot",
      description:
        "Cash on hand, monthly burn, runway, and fiscal-year revenue/expense totals, plus the " +
        "fundraising goal and percent-to-goal from real ledger data. Use for 'are we okay on money', " +
        "runway, cash, or burn questions. Numbers match the Finance dashboard exactly.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        if (!(await hasPermission(sb, orgId, "finance.read"))) return deny("finance.read");
        const cfg = await loadFinConfig(sb);
        const fy = fiscalYearBounds(cfg.year, cfg.startMonth);

        const now = new Date();
        const [txnsRes, cashRes, scheduleRows] = await Promise.all([
          sb
            .from("fin_transactions")
            .select("txn_date, amount, exclude_from_runway")
            .gte("txn_date", fy.start)
            .lte("txn_date", fy.end),
          cfg.startDate
            ? sb.from("fin_transactions").select("amount").gt("txn_date", cfg.startDate)
            : Promise.resolve({ data: [] as Array<{ amount: number }> }),
          loadRevenueSchedule(sb),
        ]);

        const txns = (txnsRes.data ?? []).map((t) => ({
          txn_date: t.txn_date as string,
          amount: Number(t.amount),
          excluded: Boolean(t.exclude_from_runway),
        }));
        const revenueYTD = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
        const expenseYTD = txns.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
        const cashOnHand = cfg.startBal + (cashRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);

        // Monthly buckets → trailing 3-active-month burn, netting out
        // exclude-from-runway one-offs (matches lib/admin/finance.ts).
        const monthMap = new Map<string, { revenue: number; expense: number; excludedExpense: number }>();
        for (const t of txns) {
          const key = t.txn_date.slice(0, 7);
          const b = monthMap.get(key) ?? { revenue: 0, expense: 0, excludedExpense: 0 };
          if (t.amount > 0) b.revenue += t.amount;
          else {
            b.expense -= t.amount;
            if (t.excluded) b.excludedExpense -= t.amount;
          }
          monthMap.set(key, b);
        }
        const active = Array.from(monthMap.values()).filter((b) => b.revenue > 0 || b.expense > 0);
        const last3 = active.slice(-3);
        const burn3mo = last3.length > 0 ? last3.reduce((s, b) => s + b.expense - b.excludedExpense, 0) / last3.length : 0;

        // Forward runway — shared engine (lib/finance/runway), so these three
        // tiers match the Finance dashboard exactly.
        const baselineSource: "config" | "trailing" =
          cfg.baseline != null && cfg.baseline > 0 ? "config" : "trailing";
        const effectiveBaseline = baselineSource === "config" ? (cfg.baseline as number) : burn3mo;
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const mtdSpend = txns
          .filter((t) => t.amount < 0 && !t.excluded && t.txn_date.slice(0, 7) === thisMonth)
          .reduce((s, t) => s - t.amount, 0);
        // Runway pledge list from the canonical schedule: committed at full
        // value, open pipeline weighted, restricted carved out by summarize.
        // Matches lib/admin/finance.ts — Reed never reads hs_deals.
        const { duePledges, projPledges } = summarizePledges(
          scheduleToRunwayPledges(scheduleRows),
          endOfMonthISO(now, 0),
          endOfMonthISO(now, cfg.horizon),
        );
        const runway = computeRunway({
          baseline: effectiveBaseline,
          baselineSource,
          bankBalance: cashOnHand,
          mtdSpend,
          duePledges,
          projPledges,
          horizonMonths: cfg.horizon,
        });
        const m = (v: number | null) => (v == null ? null : round2(v));

        return {
          fiscalYear: cfg.year,
          goal: cfg.goal,
          cashOnHand: round2(cashOnHand),
          revenueYTD: round2(revenueYTD),
          expenseYTD: round2(expenseYTD),
          netYTD: round2(revenueYTD - expenseYTD),
          burn3moMonthly: round2(burn3mo),
          burnBaselineMonthly: round2(effectiveBaseline),
          burnBaselineSource: baselineSource,
          runwayMonths: m(runway.cash.months),
          dueRunwayMonths: m(runway.due.months),
          projectedRunwayMonths: m(runway.projected.months),
          forwardHorizonMonths: cfg.horizon,
          pctToGoal: cfg.goal > 0 ? round2((revenueYTD / cfg.goal) * 100) : null,
          cashReconciledAt: cfg.reconciledAt,
          note:
            "runwayMonths is the cash tier (months beyond now). dueRunwayMonths/projectedRunwayMonths add unreceived pledges due by month-end / within the horizon. revenueYTD is bank-reconciled ledger revenue; for pipeline/forecast use get_fundraising_forecast.",
        };
      },
    },

    {
      name: "get_fundraising_forecast",
      description:
        "Fundraising forecast against the goal: raised this FY (gifts), committed (raised + stewardship " +
        "asks), weighted-open pipeline (Σ ask × probability over open stages), the resulting forecast, and " +
        "the gap to goal. Matches the CEO cockpit. Use for pipeline, forecast, or 'will we hit the goal'.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        if (!(await hasPermission(sb, orgId, "fundraising.read"))) return deny("fundraising.read");
        const cfg = await loadFinConfig(sb);
        const fy = fiscalYearBounds(cfg.year, cfg.startMonth);

        const [giftsRes, oppsRes] = await Promise.all([
          sb.from("gifts").select("amount").gte("gift_date", fy.start).lte("gift_date", fy.end),
          sb.from("opportunities").select("stage, ask_amount, probability").neq("stage", "lost").or(EXCLUDE_PARTNERSHIP_OPPS),
        ]);

        const raised = (giftsRes.data ?? []).reduce((s, g) => s + Number(g.amount), 0);
        let weightedOpen = 0;
        let committedSteward = 0;
        let openAskCount = 0;
        for (const o of oppsRes.data ?? []) {
          const ask = Number(o.ask_amount ?? 0);
          if (o.stage === "steward") {
            committedSteward += ask;
          } else if (OPEN_STAGES.includes(o.stage as string)) {
            openAskCount += 1;
            const p = o.probability == null ? 50 : Number(o.probability);
            weightedOpen += ask * (p / 100);
          }
        }
        const committed = raised + committedSteward;
        const forecast = committed + weightedOpen;
        const goal = cfg.goal;
        return {
          goal,
          raised: round2(raised),
          committedSteward: round2(committedSteward),
          committed: round2(committed),
          weightedOpen: round2(weightedOpen),
          forecast: round2(forecast),
          gap: round2(goal - forecast),
          openAskCount,
        };
      },
    },

    {
      name: "get_grant_deadlines",
      description:
        "Upcoming grant requirements (LOIs, applications, reports) with their due dates, status, and the " +
        "grant they belong to. Use for grant deadlines or 'what's due'. Defaults to the next 60 days.",
      input_schema: {
        type: "object",
        properties: {
          days: { type: "integer", description: "Look-ahead window in days (default 60).", minimum: 1, maximum: 365 },
        },
        additionalProperties: false,
      },
      run: async (input) => {
        if (!(await hasPermission(sb, orgId, "fundraising.read"))) return deny("fundraising.read");
        const days = typeof input.days === "number" ? input.days : 60;
        const today = new Date();
        const horizon = new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10);
        const todayIso = today.toISOString().slice(0, 10);

        const { data } = await sb
          .from("grant_requirements")
          .select("kind, label, due_date, status, grant:grants ( name, stage )")
          .neq("status", "submitted")
          .neq("status", "waived")
          .gte("due_date", todayIso)
          .lte("due_date", horizon)
          .order("due_date", { ascending: true })
          .limit(50);

        const items = (data ?? []).map((r) => {
          const grant = (r as { grant?: { name?: string; stage?: string } | null }).grant;
          return {
            grant: grant?.name ?? null,
            grantStage: grant?.stage ?? null,
            kind: r.kind as string,
            label: (r.label as string | null) ?? null,
            dueDate: r.due_date as string,
            status: r.status as string,
          };
        });
        return { windowDays: days, count: items.length, requirements: items };
      },
    },

    {
      name: "get_meeting_brief",
      description:
        "For an UPCOMING meeting (by calendar event id), who it's with: the external attendees matched to " +
        "your donors (constituents) and partners, plus a count of prior logged touchpoints with each — so " +
        "you can tell a first meeting from a follow-up. Call this FIRST when preparing a meeting agenda, " +
        "then pull each matched entity's dossier. Read-only.",
      input_schema: {
        type: "object",
        properties: { event_id: { type: "string", description: "The calendar event id from the meeting context." } },
        required: ["event_id"],
        additionalProperties: false,
      },
      run: async (input) => {
        const eventId = typeof input.event_id === "string" ? input.event_id : "";
        if (!eventId) return { error: "bad_request", message: "event_id is required." };

        const brief = await loadMeetingBrief(sb, orgId, eventId);
        if (!brief) return { error: "not_found", message: "No such meeting on your calendar (or you can't access it)." };

        return {
          ...brief,
          note:
            brief.entities.length === 0
              ? "No attendee matched a donor or partner — prep from the meeting title/attendees, and say the meeting is unmatched."
              : "Pull each entity's dossier (get_constituent_dossier / get_partner_dossier) before drafting. is_first_meeting=true means no prior logged interactions — treat it as an intro/discovery meeting.",
        };
      },
    },

    {
      name: "get_constituent_dossier",
      description:
        "Everything on one donor/constituent for meeting prep: profile (name, type, tags, location, " +
        "do-not-contact, notes), giving summary (lifetime total, gift count, first & last gift, largest), " +
        "active recurring plans, recent interaction history (calls/emails/meetings/notes, newest first), and " +
        "open opportunities (asks in flight with stage and next step). Ground a meeting agenda in this " +
        "person's real history — never invent giving or history. Read-only.",
      input_schema: {
        type: "object",
        properties: {
          constituent_id: { type: "string", description: "The constituent id (from get_meeting_brief)." },
          history_limit: { type: "integer", description: "How many recent interactions to return (default 15).", minimum: 1, maximum: 40 },
        },
        required: ["constituent_id"],
        additionalProperties: false,
      },
      run: async (input) => {
        if (!(await hasPermission(sb, orgId, "fundraising.read"))) return deny("fundraising.read");
        const id = typeof input.constituent_id === "string" ? input.constituent_id : "";
        if (!id) return { error: "bad_request", message: "constituent_id is required." };
        const limit = typeof input.history_limit === "number" ? input.history_limit : 15;
        const dossier = await loadConstituentDossier(sb, id, limit);
        if (!dossier) return { error: "not_found", message: "No such constituent." };
        return dossier;
      },
    },

    {
      name: "get_partner_dossier",
      description:
        "Everything on one program partner (school/employer/org) for meeting prep: profile (name, kind, " +
        "relationship status, champion, program type, teen count, MOU status & dates, notes, last touch) and " +
        "recent interaction history (newest first). Ground a partner meeting agenda in this real history. " +
        "Read-only.",
      input_schema: {
        type: "object",
        properties: {
          partner_id: { type: "string", description: "The partner id (from get_meeting_brief)." },
          history_limit: { type: "integer", description: "How many recent interactions to return (default 15).", minimum: 1, maximum: 40 },
        },
        required: ["partner_id"],
        additionalProperties: false,
      },
      run: async (input) => {
        if (!(await hasPermission(sb, orgId, "program.read"))) return deny("program.read");
        const id = typeof input.partner_id === "string" ? input.partner_id : "";
        if (!id) return { error: "bad_request", message: "partner_id is required." };
        const limit = typeof input.history_limit === "number" ? input.history_limit : 15;
        const dossier = await loadPartnerDossier(sb, id, limit);
        if (!dossier) return { error: "not_found", message: "No such partner." };
        return dossier;
      },
    },

    {
      name: "explain_metric",
      description:
        "Return the locked, authoritative definition of a BloomOS metric so explanations stay consistent " +
        "with how the dashboards compute it. Use before explaining what a number means.",
      input_schema: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            enum: ["cash_on_hand", "runway", "burn", "raised_ytd", "committed", "weighted_open", "forecast", "gap_to_goal"],
          },
        },
        required: ["metric"],
        additionalProperties: false,
      },
      run: async (input) => {
        const defs: Record<string, string> = {
          cash_on_hand: "Reconciled starting balance + the sum of all ledger transactions dated after the anchor date.",
          runway: "Cash on hand ÷ monthly burn. Null when there is no burn. ≤3 months is critical, ≤6 is a watch.",
          burn: "Average monthly expense over the last 3 active months (months with any revenue or expense).",
          raised_ytd: "Sum of gifts dated within the current fiscal year. The fundraising (gift) view, not the bank ledger.",
          committed: "Raised this FY + stewardship-stage asks (treated as committed).",
          weighted_open: "Σ(ask_amount × probability) over open stages (identify/qualify/cultivate/solicit); probability defaults to 50% when blank.",
          forecast: "Committed + weighted-open pipeline. Deliberately not total pipeline.",
          gap_to_goal: "Fundraising goal − forecast.",
        };
        const metric = String(input.metric ?? "");
        return { metric, definition: defs[metric] ?? "Unknown metric." };
      },
    },

    {
      name: "get_org_foundation_and_outcomes",
      description:
        "The organization's mission, vision, values, and behaviors, plus its tracked KPIs (title, target, " +
        "current value, status). Use this to GROUND any draft — a grant narrative or board update must be " +
        "built from these real outcomes, never invented.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        if (!(await hasPermission(sb, orgId, "reports.read"))) return deny("reports.read");
        const [foundationRes, kpiRes] = await Promise.all([
          sb.from("plan_foundation").select("mission, vision, values, behaviors").eq("org_id", orgId).maybeSingle(),
          sb
            .from("plan_kpis")
            .select("title, unit, target, current, status, cadence")
            .eq("org_id", orgId)
            .order("status", { ascending: true })
            .limit(40),
        ]);
        const f = foundationRes.data as
          | { mission?: string | null; vision?: string | null; values?: unknown; behaviors?: unknown }
          | null;
        return {
          mission: f?.mission ?? null,
          vision: f?.vision ?? null,
          values: f?.values ?? [],
          behaviors: f?.behaviors ?? [],
          kpis: (kpiRes.data ?? []).map((k) => ({
            title: (k as { title?: string }).title ?? null,
            unit: (k as { unit?: string }).unit ?? null,
            target: (k as { target?: number }).target ?? null,
            current: (k as { current?: number }).current ?? null,
            status: (k as { status?: string }).status ?? null,
          })),
        };
      },
    },

    {
      name: "save_draft",
      description:
        "Persist a draft you have composed — a grant narrative, board update, or donor acknowledgment — for " +
        "the operator to review and send. This is INERT: it stores text for human review and NEVER sends an " +
        "email, submits a grant, or changes any live record. You draft; a human always reviews and sends. " +
        "Ground the body in get_org_foundation_and_outcomes / the finance tools first — do not invent figures.",
      input_schema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["grant_narrative", "board_update", "acknowledgment", "strategy_review"] },
          title: { type: "string", description: "Short label for the draft." },
          body: { type: "string", description: "The full draft text." },
        },
        required: ["kind", "title", "body"],
        additionalProperties: false,
      },
      run: async (input) => {
        const kind = String(input.kind ?? "");
        const perm = DRAFT_PERMISSION[kind];
        if (!perm) return { error: "bad_request", message: `Unknown draft kind: ${kind}.` };
        if (!(await hasPermission(sb, orgId, perm))) return deny(perm);
        const body = typeof input.body === "string" ? input.body : "";
        if (!body.trim()) return { error: "bad_request", message: "Draft body is empty." };

        const { data, error } = await sb
          .from("reed_drafts")
          .insert({
            org_id: orgId,
            kind,
            title: typeof input.title === "string" ? input.title.slice(0, 200) : null,
            body,
            created_by: createdBy,
            status: "drafted",
          })
          .select("id")
          .single();
        if (error) return { error: "save_failed", message: error.message };
        return {
          saved: true,
          draft_id: (data as { id: string }).id,
          status: "drafted",
          note: "Saved as an inert draft for human review. Nothing was sent or submitted.",
        };
      },
    },

    {
      name: "propose_next_best_action",
      description:
        "Propose the single next best action in a module (program, fundraising, finance, ops, board, or " +
        "compliance) — what the operator should do next, and why. This is INERT: it records a recommendation " +
        "for a human to accept or dismiss; it never performs the action. Ground the rationale in tool data. " +
        "Prefer ONE high-value action over a long list.",
      input_schema: {
        type: "object",
        properties: {
          domain: { type: "string", enum: ["program", "fundraising", "finance", "ops", "board", "compliance"] },
          title: { type: "string", description: "The recommended action, imperative and specific." },
          rationale: { type: "string", description: "Why now — grounded in real figures/records." },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          target_type: { type: "string", description: "Optional: the kind of record this concerns (e.g. 'grant', 'opportunity')." },
          target_id: { type: "string", description: "Optional: the record's id." },
        },
        required: ["domain", "title", "rationale"],
        additionalProperties: false,
      },
      run: async (input) => {
        const domain = String(input.domain ?? "");
        const DOMAINS = ["program", "fundraising", "finance", "ops", "board", "compliance"];
        if (!DOMAINS.includes(domain)) return { error: "bad_request", message: `Unknown domain: ${domain}.` };
        if (!(await hasPermission(sb, orgId, `${domain}.write`))) return deny(`${domain}.write`);
        const title = typeof input.title === "string" ? input.title.trim() : "";
        if (!title) return { error: "bad_request", message: "title is required." };

        const { data, error } = await sb
          .from("reed_suggestions")
          .insert({
            org_id: orgId,
            domain,
            title: title.slice(0, 300),
            rationale: typeof input.rationale === "string" ? input.rationale.slice(0, 2000) : null,
            priority: ["high", "medium", "low"].includes(String(input.priority)) ? String(input.priority) : "medium",
            target_type: typeof input.target_type === "string" ? input.target_type.slice(0, 60) : null,
            target_id: typeof input.target_id === "string" ? input.target_id.slice(0, 200) : null,
            created_by: createdBy,
            status: "suggested",
          })
          .select("id")
          .single();
        if (error) return { error: "save_failed", message: error.message };
        return {
          proposed: true,
          suggestion_id: (data as { id: string }).id,
          status: "suggested",
          note: "Recorded as an inert suggestion. A human accepts or dismisses it; nothing was executed.",
        };
      },
    },

    {
      name: "get_strategy_plan",
      description:
        "The full OGSM plan: the org's mission/vision, then objectives → goals → initiatives, with each " +
        "goal's KPIs (unit, target, current, owner, cadence, status). Use to review or discuss strategy.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        if (!(await hasPermission(sb, orgId, "reports.read"))) return deny("reports.read");
        const [foundationRes, plan] = await Promise.all([
          sb.from("plan_foundation").select("mission, vision").eq("org_id", orgId).maybeSingle(),
          loadPlan(sb, orgId),
        ]);
        const f = foundationRes.data as { mission?: string | null; vision?: string | null } | null;
        const kpisByGoal = (gid: string) => plan.kpis.filter((k) => S(k, "goal_id") === gid);
        const initsByGoal = (gid: string) => plan.initiatives.filter((i) => S(i, "goal_id") === gid);
        const goalsByObj = (oid: string) => plan.goals.filter((g) => S(g, "objective_id") === oid);
        return {
          mission: f?.mission ?? null,
          vision: f?.vision ?? null,
          lastReviewAt: plan.review ? plan.review["conducted_at"] ?? null : null,
          nextReviewAt: plan.review ? plan.review["next_review_at"] ?? null : null,
          objectives: plan.objectives.map((o) => ({
            id: S(o, "id"),
            title: S(o, "title"),
            three_year_statement: o["three_year_statement"] ?? null,
            owner: o["owner"] ?? null,
            status: o["status"] ?? null,
            goals: goalsByObj(S(o, "id")).map((g) => ({
              id: S(g, "id"),
              title: S(g, "title"),
              target_date: g["target_date"] ?? null,
              owner: g["owner"] ?? null,
              status: g["status"] ?? null,
              initiatives: initsByGoal(S(g, "id")).map((i) => ({ title: S(i, "title"), owner: i["owner"] ?? null, status: i["status"] ?? null })),
              kpis: kpisByGoal(S(g, "id")).map((k) => ({
                title: S(k, "title"),
                unit: k["unit"] ?? null,
                target: k["target"] ?? null,
                current: k["current"] ?? null,
                owner: k["owner"] ?? null,
                cadence: k["cadence"] ?? null,
                status: k["status"] ?? null,
              })),
            })),
          })),
        };
      },
    },

    {
      name: "get_strategy_coherence",
      description:
        "Deterministic structural findings on the OGSM plan — orphaned objectives/goals, goals with no " +
        "KPI or initiative, dangling initiatives, KPIs missing target/owner/source/cadence, goals missing " +
        "target_date/owner, KPI↔objective mismatches, objective count, and overdue review. These are " +
        "computed from the real rows (not guesses) — call this FIRST and lead your review with them.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        if (!(await hasPermission(sb, orgId, "reports.read"))) return deny("reports.read");
        const plan = await loadPlan(sb, orgId);
        const goalIds = new Set(plan.goals.map((g) => S(g, "id")));
        const objById = new Map(plan.objectives.map((o) => [S(o, "id"), o]));
        const goalById = new Map(plan.goals.map((g) => [S(g, "id"), g]));
        const goalsForObj = (oid: string) => plan.goals.filter((g) => S(g, "objective_id") === oid);
        const kpisForGoal = (gid: string) => plan.kpis.filter((k) => S(k, "goal_id") === gid);
        const initsForGoal = (gid: string) => plan.initiatives.filter((i) => S(i, "goal_id") === gid);

        const today = new Date().toISOString().slice(0, 10);
        const KPI_REQUIRED = ["target", "unit", "owner", "cadence"] as const;

        const findings = {
          objective_count: plan.objectives.length,
          objective_count_flag:
            plan.objectives.length === 0 ? "none" : plan.objectives.length > 5 ? "too_many" : plan.objectives.length < 3 ? "few" : "ok",
          objectives_without_goal: plan.objectives.filter((o) => goalsForObj(S(o, "id")).length === 0).map((o) => S(o, "title")),
          goals_without_kpi: plan.goals.filter((g) => kpisForGoal(S(g, "id")).length === 0).map((g) => S(g, "title")),
          goals_without_initiative: plan.goals.filter((g) => initsForGoal(S(g, "id")).length === 0).map((g) => S(g, "title")),
          goals_missing_target_date: plan.goals.filter((g) => missing(g, "target_date")).map((g) => S(g, "title")),
          goals_missing_owner: plan.goals.filter((g) => missing(g, "owner")).map((g) => S(g, "title")),
          initiatives_dangling: plan.initiatives.filter((i) => !goalIds.has(S(i, "goal_id"))).map((i) => S(i, "title")),
          kpis_missing_fields: plan.kpis
            .map((k) => {
              const gaps = KPI_REQUIRED.filter((field) => missing(k, field));
              if (missing(k, "source") && missing(k, "metric_key")) gaps.push("source" as (typeof KPI_REQUIRED)[number]);
              return gaps.length ? { kpi: S(k, "title"), missing: gaps } : null;
            })
            .filter(Boolean),
          kpis_objective_mismatch: plan.kpis
            .filter((k) => {
              const oid = S(k, "objective_id");
              const g = goalById.get(S(k, "goal_id"));
              return oid && g && S(g, "objective_id") && oid !== S(g, "objective_id");
            })
            .map((k) => S(k, "title")),
          review_overdue: plan.review && plan.review["next_review_at"] ? String(plan.review["next_review_at"]) < today : null,
          next_review_at: plan.review ? plan.review["next_review_at"] ?? null : null,
        };
        void objById;
        return findings;
      },
    },

    {
      name: "propose_plan_element",
      description:
        "Propose a new OGSM element — an objective, goal, initiative, or KPI — grounded in the mission and " +
        "real data (call get_strategy_plan / get_strategy_coherence / the finance tools first). This is " +
        "INERT: it records a proposal the operator edits, accepts, or dismisses; it NEVER writes the plan. " +
        "Ladder children to a real parent via parent_type + parent_id (the id from get_strategy_plan). For a " +
        "KPI, set a target and unit but DO NOT claim a current value. Prefer a few sharp proposals over many.",
      input_schema: {
        type: "object",
        properties: {
          proposed_type: { type: "string", enum: ["objective", "goal", "initiative", "kpi"] },
          title: { type: "string", description: "The element's title (imperative/specific)." },
          rationale: { type: "string", description: "Why this, grounded in mission + real figures." },
          parent_type: { type: "string", enum: ["objective", "goal"], description: "What it ladders to (goal→objective; initiative/kpi→goal)." },
          parent_id: { type: "string", description: "The parent's id from get_strategy_plan, when laddering to an existing element." },
          fields: {
            type: "object",
            description:
              "Level-specific fields: objective → three_year_statement, owner; goal → target_date, owner; " +
              "initiative → owner; kpi → unit, target, cadence, owner, source.",
            additionalProperties: true,
          },
        },
        required: ["proposed_type", "title", "rationale"],
        additionalProperties: false,
      },
      run: async (input) => {
        const type = String(input.proposed_type ?? "");
        if (!["objective", "goal", "initiative", "kpi"].includes(type)) return { error: "bad_request", message: `Unknown proposed_type: ${type}.` };
        // The plan is leadership-owned; proposing against it needs org.manage.
        if (!(await hasPermission(sb, orgId, "org.manage"))) return deny("org.manage");
        const title = typeof input.title === "string" ? input.title.trim() : "";
        if (!title) return { error: "bad_request", message: "title is required." };

        const fields = input.fields && typeof input.fields === "object" ? (input.fields as Record<string, unknown>) : {};
        const parentRef =
          typeof input.parent_type === "string"
            ? { type: input.parent_type, id: typeof input.parent_id === "string" ? input.parent_id : null }
            : null;

        const { data, error } = await sb
          .from("reed_plan_proposals")
          .insert({
            org_id: orgId,
            proposed_type: type,
            parent_ref: parentRef,
            payload: { title: title.slice(0, 300), ...fields },
            rationale: typeof input.rationale === "string" ? input.rationale.slice(0, 2000) : null,
            created_by: createdBy,
            status: "proposed",
          })
          .select("id")
          .single();
        if (error) return { error: "save_failed", message: error.message };
        return {
          proposed: true,
          proposal_id: (data as { id: string }).id,
          status: "proposed",
          note: "Recorded as an inert plan proposal for the operator to edit, accept, or dismiss. The plan was not changed.",
        };
      },
    },
  ];
}
