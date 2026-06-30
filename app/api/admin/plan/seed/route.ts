import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// One-time content lift of AA's real strategy (specs/bloomos-strategy.md,
// Appendix A) — the KeyneLink identity layer + the 2026 OGSM, captured as data.
// Idempotent: the foundation row is upserted (safe to re-run), and the OGSM
// tree is only seeded when the org has no objectives yet, so re-posting never
// duplicates. Seeds ONLY the caller's org.

type SeedKpi = {
  title: string;
  unit?: string;
  target?: number;
  source: "auto" | "manual";
  metric_key?: string;
};
type SeedGoal = { title: string; owner?: string; kpis: SeedKpi[] };
type SeedObjective = {
  title: string;
  three_year_statement: string;
  owner?: string;
  goals: SeedGoal[];
};

const FOUNDATION = {
  mission:
    "To empower low-income teens with career development, equipping them with the skills, confidence, and networks to succeed in life and work.",
  vision:
    "To create a world where every young person, regardless of background, has the tools, support, and opportunities to build a thriving and purposeful career.",
  values: ["Agency", "Human Flourishing", "Innovation", "Execution", "Learning", "Purpose"],
  behaviors: ["Disciplined", "Agentic", "Hustle", "Productive", "Problem Solver"],
};

const OBJECTIVES: SeedObjective[] = [
  {
    title: "Deliver an impactful program experience",
    three_year_statement:
      "Define and measure success, find the best formats, find new programmatic opportunities. 2026: establish a credible, validated FOS baseline and demonstrate measurable growth.",
    owner: "Remi",
    goals: [
      {
        title:
          "Establish a documented FOS baseline from a minimum of 150 students, analyzed with Empathy Labs.",
        owner: "Remi / Empathy Labs",
        kpis: [
          { title: "FOS baseline established", unit: "students", target: 150, source: "manual", metric_key: "fos_baseline" },
          { title: "FOS growth vs baseline", unit: "%", source: "manual", metric_key: "fos_growth" },
        ],
      },
      {
        title:
          "Identify and document the top 3 drivers of teen engagement and completion in the app, via a three-condition pilot (money only, money plus adult, adult only), 200–300 teens.",
        owner: "Remi",
        kpis: [
          { title: "Teens recruited into the pilot", unit: "teens", target: 300, source: "manual" },
          { title: "Top engagement drivers documented", unit: "drivers", target: 3, source: "manual" },
          { title: "30/60/90 retention by condition", unit: "%", source: "manual" },
        ],
      },
      {
        title:
          "Design, build, and pilot the adult engagement experience (dashboard, prompts, conversation guides) with at least 2 partner orgs.",
        owner: "Remi / contractor",
        kpis: [
          { title: "Discovery interviews done", unit: "interviews", source: "manual", metric_key: "discovery_interviews_done" },
          { title: "Conversation guides complete", unit: "guides", source: "manual" },
          { title: "Partner orgs piloting", unit: "orgs", target: 2, source: "manual" },
        ],
      },
    ],
  },
  {
    title: "Execute an effective and efficient fundraising strategy",
    three_year_statement:
      "Full-budget coverage through a diversified mix, plus a donor experience that drives long-term giving. 2026: reach full-budget coverage across foundations, corporate, individual, AIG, and earned revenue.",
    owner: "Remi",
    goals: [
      {
        title:
          "Raise $400k+ from foundations and grants by submitting at least 12 grant applications.",
        owner: "Remi",
        kpis: [
          { title: "Dollars raised from grants (YTD)", unit: "$", target: 400000, source: "auto", metric_key: "dollars_raised_grants_ytd" },
          { title: "Grants submitted (YTD)", unit: "grants", target: 12, source: "auto", metric_key: "grants_submitted_ytd" },
        ],
      },
      {
        title:
          "Close at least 2 corporate partners (priority: Twilio, Monterra) generating $100k+ combined.",
        owner: "Remi",
        kpis: [
          { title: "Corporate dollars (YTD)", unit: "$", target: 100000, source: "auto", metric_key: "corporate_dollars_ytd" },
          { title: "Corporate partners closed", unit: "partners", target: 2, source: "manual" },
        ],
      },
      {
        title:
          "Make meaningful progress on AIG: finalize the program plan, identify 10 prospects, make at least 5 asks.",
        owner: "Remi",
        kpis: [
          { title: "AIG prospects identified", unit: "prospects", target: 10, source: "manual" },
          { title: "AIG asks made", unit: "asks", target: 5, source: "manual" },
        ],
      },
      {
        title: "Send at least 4 substantive donor updates with student impact highlights.",
        owner: "Remi",
        kpis: [
          { title: "Donor updates sent (YTD)", unit: "updates", target: 4, source: "auto", metric_key: "donor_updates_sent_ytd" },
        ],
      },
    ],
  },
  {
    title: "Demonstrate the most effective and efficient recruitment strategy",
    three_year_statement:
      "A proven, replicable partnership model, and an adult engagement model with parents and mentors as the primary drivers. 2026: build the partnership model that drives consistent recruitment and engagement.",
    owner: "Remi",
    goals: [
      {
        title: "Reach 500 verified active teens on the app by end of Q3.",
        owner: "Remi",
        kpis: [
          { title: "Active teens", unit: "teens", target: 500, source: "auto", metric_key: "active_teens" },
        ],
      },
      {
        title:
          "Complete and deploy a partner onboarding playbook that lets partners run independently.",
        owner: "Remi / contractor",
        kpis: [
          { title: "Playbook sections complete", unit: "sections", source: "manual" },
          { title: "Partners onboarded with the playbook", unit: "partners", source: "manual" },
        ],
      },
      {
        title:
          "Pilot the adult engagement model with at least 2 partner orgs and 30+ parents or mentors enrolled.",
        owner: "Remi",
        kpis: [
          { title: "Partner orgs confirmed", unit: "orgs", target: 2, source: "manual" },
          { title: "Adults enrolled", unit: "adults", target: 30, source: "manual" },
          { title: "% of adults linked to an active teen", unit: "%", source: "manual" },
        ],
      },
    ],
  },
  {
    title: "Build a strong infrastructure for a sustainable organization",
    three_year_statement:
      "A board that participates in fundraising and oversight; a team, systems, and culture that operate without founder dependency; consistent compliance as the org scales. 2026: same, with the filings and rhythms below.",
    owner: "Shannon / Remi",
    goals: [
      {
        title:
          "Complete all required financial and compliance filings on time: 990, RRF-1, SOS, payroll audits.",
        owner: "Shannon / Remi",
        kpis: [
          { title: "Filings completed on time", unit: "filings", source: "manual", metric_key: "filings_on_time" },
        ],
      },
      {
        title: "Conduct monthly OGSM reviews with the full team and document outcomes.",
        owner: "Remi",
        kpis: [
          { title: "Reviews completed this year", unit: "reviews", target: 12, source: "manual" },
        ],
      },
      {
        title:
          "Document at least 3 core operational processes so the org isn't dependent on Remi for execution.",
        owner: "Remi / Shannon",
        kpis: [
          { title: "Processes documented", unit: "processes", target: 3, source: "manual", metric_key: "processes_documented" },
        ],
      },
    ],
  },
];

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const orgId = ctx.orgId;
  const supabase = getSupabaseAdmin();

  // Foundation is idempotent on its own (unique org_id) — always (re)write it.
  await supabase
    .from("plan_foundation")
    .upsert(
      {
        org_id: orgId,
        mission: FOUNDATION.mission,
        vision: FOUNDATION.vision,
        values: FOUNDATION.values,
        behaviors: FOUNDATION.behaviors,
      },
      { onConflict: "org_id" }
    );

  // Only seed the OGSM tree once — presence of any objective means it's done.
  const { count } = await supabase
    .from("plan_objectives")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  if ((count ?? 0) > 0) {
    await audit(req, {
      action: "governance.strategy.seed",
      entityType: "plan_objective",
      entityId: null,
      after: { skipped: true, reason: "objectives already exist" },
    });
    return NextResponse.json({ ok: true, seeded: false, reason: "already seeded" });
  }

  let objectives = 0;
  let goals = 0;
  let kpis = 0;

  for (let oi = 0; oi < OBJECTIVES.length; oi++) {
    const o = OBJECTIVES[oi];
    const { data: objRow, error: objErr } = await supabase
      .from("plan_objectives")
      .insert({
        org_id: orgId,
        title: o.title,
        three_year_statement: o.three_year_statement,
        owner: o.owner ?? null,
        sort_order: oi,
      })
      .select("id")
      .single();
    if (objErr || !objRow) {
      console.error("Seed objective failed:", objErr?.message);
      return NextResponse.json({ error: "Seed failed at objectives" }, { status: 500 });
    }
    objectives++;

    for (let gi = 0; gi < o.goals.length; gi++) {
      const g = o.goals[gi];
      const { data: goalRow, error: goalErr } = await supabase
        .from("plan_goals")
        .insert({
          org_id: orgId,
          objective_id: objRow.id,
          title: g.title,
          owner: g.owner ?? null,
          sort_order: gi,
        })
        .select("id")
        .single();
      if (goalErr || !goalRow) {
        console.error("Seed goal failed:", goalErr?.message);
        return NextResponse.json({ error: "Seed failed at goals" }, { status: 500 });
      }
      goals++;

      if (g.kpis.length > 0) {
        const { error: kpiErr } = await supabase.from("plan_kpis").insert(
          g.kpis.map((k) => ({
            org_id: orgId,
            goal_id: goalRow.id,
            title: k.title,
            unit: k.unit ?? null,
            target: k.target ?? null,
            owner: g.owner ?? null,
            source: k.source,
            metric_key: k.metric_key ?? null,
          }))
        );
        if (kpiErr) {
          console.error("Seed KPI failed:", kpiErr.message);
          return NextResponse.json({ error: "Seed failed at KPIs" }, { status: 500 });
        }
        kpis += g.kpis.length;
      }
    }
  }

  await audit(req, {
    action: "governance.strategy.seed",
    entityType: "plan_objective",
    entityId: null,
    after: { objectives, goals, kpis },
  });
  return NextResponse.json({ ok: true, seeded: true, objectives, goals, kpis });
}
