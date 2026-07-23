import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { todayInTZ } from "@/lib/admin/ops/week";
import { personalize } from "@/lib/fundraising/comms-email";
import {
  receiptEmailText,
  receiptEmailHtml,
  type ReceiptGift,
} from "@/lib/fundraising/receipt";
import { ensureAckTaskForGift, ensureEscalationTaskForGift, type AckQueueGift } from "@/lib/fundraising/ack-tasks";
import { getDefaultSteward } from "@/lib/fundraising/steward";
import { constituentName } from "@/lib/fundraising/display";

/**
 * The stewardship matrix. When a gift lands, ordered rows in `stewardship_rules`
 * (first match wins) decide the response: auto-send a compliant receipt with no
 * human step, spawn an ops_task for a personal touch, both, or nothing. The
 * matrix is data, never `if amount >= 250` in a page, so each org gets its own.
 */

export type StewardshipAction = "auto_email" | "create_task" | "create_task_and_draft" | "none" | "escalate";

export type StewardshipRule = {
  id: string;
  name: string;
  rank: number;
  conditions: Conditions;
  action: StewardshipAction;
  channel: string;
  template_id: string | null;
  sla_hours: number;
  assignee: string | null;
};

// All present conditions are AND-ed; an absent condition is ignored.
type Conditions = {
  min_amount?: number;
  max_amount?: number;
  methods?: string[];
  sources?: string[];
  recurring?: boolean;
  first_gift?: boolean;
  max_age_days?: number;
};

export type GiftFacts = {
  amount: number;
  method: string;
  gift_date: string; // YYYY-MM-DD
  external_source: string | null;
  recurring: boolean;
  isFirstGift: boolean;
  ageDays: number;
};

export type StewardshipDecision = {
  action: StewardshipAction;
  channel: string;
  templateId: string | null;
  slaHours: number;
  assignee: string | null;
  ruleId: string | null;
  ruleName: string;
};

const NONE: StewardshipDecision = {
  action: "none",
  channel: "email",
  templateId: null,
  slaHours: 48,
  assignee: null,
  ruleId: null,
  ruleName: "no match",
};

const ACK_FROM = "Ambition Angels <careers@mail.ambitionangels.org>";
const DEFAULT_AUTO_NOTE =
  "Thank you so much for your generous gift. Your support directly funds the students and programs at the heart of our mission, and it means the world to us.";

export function ageInDays(giftDate: string, today: string = todayInTZ()): number {
  const a = Date.parse(giftDate.slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(today + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

function ruleMatches(c: Conditions, f: GiftFacts): boolean {
  if (c.min_amount != null && f.amount < c.min_amount) return false;
  if (c.max_amount != null && f.amount > c.max_amount) return false;
  if (c.methods && !c.methods.includes(f.method)) return false;
  if (c.sources && !(f.external_source && c.sources.includes(f.external_source))) return false;
  if (c.recurring != null && f.recurring !== c.recurring) return false;
  if (c.first_gift != null && f.isFirstGift !== c.first_gift) return false;
  if (c.max_age_days != null && f.ageDays > c.max_age_days) return false;
  return true;
}

/**
 * Pure evaluation of the PRIMARY task: first matching rule (rank-ordered) wins.
 * Escalation rules are orthogonal (they add a task, never replace the primary),
 * so they're skipped here and handled by escalationsFor().
 */
export function evaluateStewardship(facts: GiftFacts, rules: StewardshipRule[]): StewardshipDecision {
  for (const r of rules) {
    if (r.action === "escalate") continue;
    if (ruleMatches(r.conditions ?? {}, facts)) {
      return {
        action: r.action,
        channel: r.channel,
        templateId: r.template_id,
        slaHours: r.sla_hours,
        assignee: r.assignee,
        ruleId: r.id,
        ruleName: r.name,
      };
    }
  }
  return NONE;
}

/**
 * The escalation rules that match a gift. These are additive: a major gift gets
 * a task for its escalation owner (e.g. Remi) ON TOP OF the primary Shannon
 * task, regardless of which primary rule matched.
 */
export function escalationsFor(facts: GiftFacts, rules: StewardshipRule[]): StewardshipRule[] {
  return rules.filter((r) => r.action === "escalate" && ruleMatches(r.conditions ?? {}, facts));
}

export async function loadStewardshipRules(
  supabase: SupabaseClient,
  orgId: string
): Promise<StewardshipRule[]> {
  const { data, error } = await supabase
    .from("stewardship_rules")
    .select("id, name, rank, conditions, action, channel, template_id, sla_hours, assignee")
    .eq("org_id", orgId)
    .eq("active", true)
    .order("rank", { ascending: true });
  if (error) {
    console.error("[stewardship] loadRules failed:", error.message);
    return [];
  }
  return (data ?? []) as StewardshipRule[];
}

type GiftRow = {
  id: string;
  amount: number;
  gift_date: string;
  method: string;
  external_source: string | null;
  recurring_plan_id: string | null;
  acknowledgment_status: string;
  constituent_id: string | null;
  fair_market_value: number | null;
  deductible_amount: number | null;
  constituent: {
    type: string;
    first_name: string | null;
    last_name: string | null;
    org_name: string | null;
    emails: string[];
  } | null;
};

async function setGiftStatus(
  supabase: SupabaseClient,
  giftId: string,
  status: "pending" | "not_required"
) {
  // Never override a gift that's already been thanked.
  await supabase
    .from("gifts")
    .update({ acknowledgment_status: status })
    .eq("id", giftId)
    .neq("acknowledgment_status", "sent");
}

async function autoSendReceipt(
  supabase: SupabaseClient,
  orgId: string,
  gift: GiftRow,
  tpl: { subject: string | null; body: string } | null
): Promise<boolean> {
  const toEmail = gift.constituent?.emails?.[0];
  if (!toEmail || !process.env.RESEND_API_KEY) return false;

  const firstName = gift.constituent?.first_name || gift.constituent?.org_name || "friend";
  const note = personalize(tpl?.body?.trim() ? tpl.body : DEFAULT_AUTO_NOTE, firstName);
  const subject = tpl?.subject ? personalize(tpl.subject, firstName) : "Thank you for your gift";

  const receiptGift: ReceiptGift = {
    amount: Number(gift.amount),
    gift_date: gift.gift_date,
    method: gift.method,
    fair_market_value: gift.fair_market_value === null ? null : Number(gift.fair_market_value),
    deductible_amount: gift.deductible_amount === null ? null : Number(gift.deductible_amount),
  };
  const text = receiptEmailText(note, receiptGift);
  const html = receiptEmailHtml(note, receiptGift);
  const sentAt = new Date().toISOString();

  // Claim before sending — the same atomic double-send guard the manual path
  // uses. If it's already sent, there's nothing to do.
  const { data: claimed } = await supabase
    .from("gifts")
    .update({ acknowledgment_status: "sent", acknowledged_at: sentAt })
    .eq("id", gift.id)
    .neq("acknowledgment_status", "sent")
    .select("id");
  if (!claimed || claimed.length === 0) return true;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const res = await resend.emails.send({ from: ACK_FROM, to: toEmail, subject, text, html });
    if (res.error) {
      await supabase
        .from("gifts")
        .update({ acknowledgment_status: "pending", acknowledged_at: null })
        .eq("id", gift.id);
      return false;
    }
  } catch (e) {
    // Unknown outcome: keep the claim so we never double-email a donor.
    console.error("[stewardship] auto-receipt send unknown:", e);
    return true;
  }

  await supabase.from("acknowledgments").insert({
    org_id: orgId,
    gift_id: gift.id,
    subject_type: "gift",
    subject_id: gift.id,
    subject_label: gift.constituent
      ? gift.constituent.type === "organization"
        ? gift.constituent.org_name
        : [gift.constituent.first_name, gift.constituent.last_name].filter(Boolean).join(" ")
      : null,
    template: "auto-receipt",
    channel: "email",
    subject,
    body: text,
    sent_by: "system",
    sent_at: sentAt,
  });
  return true;
}

/**
 * Run the matrix for one gift and act on it: auto-send a receipt, spawn an ack
 * task, or mark it not-required. Best-effort and idempotent — safe to call from
 * any gift-creation path. Returns the decision for logging/tests.
 */
export async function processGiftStewardship(
  supabase: SupabaseClient,
  opts: { orgId: string; createdBy: string; giftId: string }
): Promise<StewardshipDecision | null> {
  try {
    const { data: giftData } = await supabase
      .from("gifts")
      .select(
        "id, amount, gift_date, method, external_source, recurring_plan_id, acknowledgment_status, constituent_id, fair_market_value, deductible_amount, constituent:constituents(type, first_name, last_name, org_name, emails)"
      )
      .eq("id", opts.giftId)
      .maybeSingle();
    const gift = giftData as unknown as GiftRow | null;
    if (!gift) return null;
    if (gift.acknowledgment_status === "sent") return NONE; // already thanked

    const rules = await loadStewardshipRules(supabase, opts.orgId);

    let isFirstGift = false;
    if (gift.constituent_id) {
      const { count } = await supabase
        .from("gifts")
        .select("id", { count: "exact", head: true })
        .eq("constituent_id", gift.constituent_id);
      isFirstGift = (count ?? 0) <= 1;
    }

    const facts: GiftFacts = {
      amount: Number(gift.amount),
      method: gift.method,
      gift_date: gift.gift_date,
      external_source: gift.external_source,
      recurring: !!gift.recurring_plan_id,
      isFirstGift,
      ageDays: ageInDays(gift.gift_date),
    };
    // Unseeded org (no rules yet, or the tables not applied): preserve the
    // Phase 2 behavior — any gift with a donor becomes a personal-touch task —
    // so thank-yous are never silently dropped before the matrix is seeded.
    const steward = await getDefaultSteward(supabase, opts.orgId);
    const decision: StewardshipDecision =
      rules.length === 0
        ? {
            action: gift.constituent_id ? "create_task" : "none",
            channel: "email",
            templateId: null,
            slaHours: 48,
            assignee: steward,
            ruleId: null,
            ruleName: "default (unseeded)",
          }
        : evaluateStewardship(facts, rules);

    // ── Primary task (one per gift, first-match) ──
    if (decision.action === "auto_email") {
      let tpl: { subject: string | null; body: string } | null = null;
      if (decision.templateId) {
        const { data } = await supabase
          .from("ack_templates")
          .select("subject, body")
          .eq("id", decision.templateId)
          .maybeSingle();
        tpl = (data as { subject: string | null; body: string } | null) ?? null;
      }
      const ok = await autoSendReceipt(supabase, opts.orgId, gift, tpl);
      if (!ok) await setGiftStatus(supabase, opts.giftId, "not_required");
    } else if (decision.action === "create_task" || decision.action === "create_task_and_draft") {
      if (gift.constituent_id) {
        await ensureAckTaskForGift(supabase, {
          orgId: opts.orgId,
          createdBy: opts.createdBy,
          giftId: gift.id,
          constituentId: gift.constituent_id,
          amount: facts.amount,
          giftDate: gift.gift_date,
          slaHours: decision.slaHours,
          assignee: decision.assignee ?? steward,
          priority: facts.amount >= 1000 ? "high" : "medium",
        });
        await setGiftStatus(supabase, opts.giftId, "pending");
      } else {
        // No one to personally thank (anonymous) — don't strand it in the queue.
        await setGiftStatus(supabase, opts.giftId, "not_required");
      }
    } else {
      // action === 'none'
      await setGiftStatus(supabase, opts.giftId, "not_required");
    }

    // ── Escalations (additional tasks, orthogonal to the primary) ──
    // A matching additive rule gets its own task on top of the primary — a
    // major-gift owner call, or an org's extra touch like a handwritten-note
    // step. The task carries the rule's name and template body so it reads as
    // the rule, not as generic major-gift copy.
    if (gift.constituent_id) {
      const escalations = escalationsFor(facts, rules);
      if (escalations.length) {
        const donorName = gift.constituent ? constituentName(gift.constituent) : "this donor";
        const noteBodies = await loadTemplateBodies(supabase, escalations);
        for (const esc of escalations) {
          await ensureEscalationTaskForGift(supabase, {
            orgId: opts.orgId,
            createdBy: opts.createdBy,
            giftId: gift.id,
            constituentId: gift.constituent_id,
            donorName,
            amount: facts.amount,
            giftDate: gift.gift_date,
            assignee: esc.assignee ?? opts.createdBy,
            slaHours: esc.sla_hours,
            ruleName: esc.name,
            noteBody: esc.template_id ? noteBodies.get(esc.template_id) ?? null : null,
          });
        }
      }
    }

    return decision;
  } catch (e) {
    console.error("[stewardship] processGift threw:", e);
    return null;
  }
}

/**
 * Ensure major-gift escalation tasks for a batch of pending gifts (the queue
 * reconcile path). Covers gifts that never run processGiftStewardship — Stripe
 * (DB trigger) and pledge installments — so a big gift from any source still
 * reaches its escalation owner. Idempotent and best-effort.
 */
export async function ensureEscalationsForQueue(
  supabase: SupabaseClient,
  orgId: string,
  createdBy: string,
  gifts: AckQueueGift[]
): Promise<void> {
  const rules = await loadStewardshipRules(supabase, orgId);
  const escalationRules = rules.filter((r) => r.action === "escalate");
  if (escalationRules.length === 0) return;
  const noteBodies = await loadTemplateBodies(supabase, escalationRules);
  for (const g of gifts) {
    if (!g.constituent_id) continue;
    const facts: GiftFacts = {
      amount: g.amount,
      method: g.method,
      gift_date: g.gift_date,
      external_source: g.external_source,
      recurring: false,
      isFirstGift: false,
      ageDays: ageInDays(g.gift_date),
    };
    for (const esc of escalationsFor(facts, rules)) {
      await ensureEscalationTaskForGift(supabase, {
        orgId,
        createdBy,
        giftId: g.id,
        constituentId: g.constituent_id,
        donorName: g.constituent ? constituentName(g.constituent) : "this donor",
        amount: g.amount,
        giftDate: g.gift_date,
        assignee: esc.assignee ?? createdBy,
        slaHours: esc.sla_hours,
        ruleName: esc.name,
        noteBody: esc.template_id ? noteBodies.get(esc.template_id) ?? null : null,
      });
    }
  }
}

/** Template bodies for the rules that reference one, in a single read. */
async function loadTemplateBodies(
  supabase: SupabaseClient,
  rules: StewardshipRule[]
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(rules.map((r) => r.template_id).filter((x): x is string => !!x)));
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("ack_templates").select("id, body").in("id", ids);
  return new Map(((data ?? []) as { id: string; body: string }[]).map((t) => [t.id, t.body]));
}

/**
 * Lightweight decision for the bulk CSV import path: amount/method/age/source
 * only (no per-row first-gift count, no email or task side effects). Historical
 * imports age out of every rule and land 'not_required'; a recent row that
 * would need a human lands 'pending' for the queue.
 */
export function decideImportStatus(
  facts: Omit<GiftFacts, "isFirstGift">,
  rules: StewardshipRule[]
): "pending" | "not_required" {
  const decision = evaluateStewardship({ ...facts, isFirstGift: false }, rules);
  return decision.action === "create_task" || decision.action === "create_task_and_draft"
    ? "pending"
    : "not_required";
}
