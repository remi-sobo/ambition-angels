/**
 * GET /api/admin/search?q= — BloomOS global search (Phase 1, "navigator").
 *
 * Fans out one query across the Tier-1 entities (people, prospects, grants,
 * tasks, projects, partners, students, meetings, cohorts, commitments) in
 * parallel and returns a single normalized, ranked list of hits. The overlay
 * (app/admin/_components/search/GlobalSearch.tsx) groups them for display and
 * merges in client-side page/action matches.
 *
 * Auth + RLS: same posture as /api/admin/constituents/search — gated by
 * isAuthed(), queried through the user-session client so search can never
 * surface a row the signed-in admin couldn't already open. Each sub-query is
 * isolated (Promise.allSettled): one failing table degrades that group, never
 * the whole search.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { constituentName } from "@/lib/fundraising/display";
import type { SearchGroup, SearchHit, SearchKind } from "@/app/admin/_components/search/types";

export const dynamic = "force-dynamic";

const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Minor per-kind tiebreaker (≤ the gap between match tiers below) so that when
// two rows match equally well, people/orgs float above tasks.
const KIND_WEIGHT: Record<SearchKind, number> = {
  constituent: 6,
  prospect: 5,
  grant: 5,
  partner: 4,
  student: 4,
  commitment: 4,
  project: 3,
  task: 3,
  cohort: 3,
  booking: 2,
  page: 0,
  action: 0,
};

/** Rank by how cleanly the query hits the display title, + a kind tiebreaker. */
function score(kind: SearchKind, title: string, q: string): number {
  const t = title.toLowerCase();
  const needle = q.toLowerCase();
  let base = 40; // matched on a secondary field (email, school, description…)
  if (t.startsWith(needle)) base = 100;
  else if (t.includes(needle)) base = 70;
  return base + KIND_WEIGHT[kind];
}

// Minimal row shapes for the columns each sub-query selects.
type ConstituentRow = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  emails: string[] | null;
};
type ProspectRow = { id: string; name: string; org_name: string | null; type: string };
type GrantRow = { id: string; name: string; stage: string; amount_requested: number | null; owner: string | null };
type CommitmentRow = { id: string; source_name: string; amount: number | null; status: string; year: number | null };
type TaskRow = { id: string; title: string; status: string; priority: string | null; assigned_to: string | null };
type ProjectRow = { id: string; title: string; status: string; category: string };
type PartnerRow = { id: string; name: string; kind: string; status: string };
type StudentRow = { id: string; first_name: string | null; last_name: string | null; school: string | null; stage: string };
type CohortRow = { id: string; name: string; term: string | null; status: string };
type BookingRow = { id: string; attendee_name: string | null; attendee_email: string | null; start_time: string | null };

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Strip characters that would break the PostgREST or() filter grammar.
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/[(),*%]/g, " ").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = createServerSupabase();
  const like = `%${q}%`;
  const LIMIT = 6;

  const mk = (
    kind: SearchKind,
    group: SearchGroup,
    id: string | null,
    title: string,
    href: string,
    subtitle?: string,
    badge?: string
  ): SearchHit => ({ kind, group, id, title, subtitle, badge, href, score: score(kind, title, q) });

  // Each task resolves to SearchHit[]; a rejected/erroring table yields [].
  // Supabase's builder is a PromiseLike thenable — Promise.allSettled accepts it.
  const tasks: Array<PromiseLike<SearchHit[]>> = [
    // People & organizations (the fundraising spine).
    supabase
      .from("constituents")
      .select("id, type, first_name, last_name, org_name, emails")
      .or(`first_name.ilike.${like},last_name.ilike.${like},org_name.ilike.${like}`)
      .is("archived_at", null)
      .limit(LIMIT)
      .then(({ data }) =>
        ((data ?? []) as ConstituentRow[]).map((c) => {
          const name = constituentName(c);
          const sub = [c.type === "organization" ? "Organization" : "Person", c.emails?.[0]]
            .filter(Boolean)
            .join(" · ");
          return mk("constituent", "people", c.id, name, `/admin/fundraising/donors/${c.id}`, sub);
        })
      ),

    // Prospect bench (has its own detail page; keyed by its own uuid).
    supabase
      .from("fr_prospects")
      .select("id, name, org_name, type, status")
      .or(`name.ilike.${like},org_name.ilike.${like},email.ilike.${like}`)
      .neq("status", "disqualified")
      .limit(LIMIT)
      .then(({ data }) =>
        ((data ?? []) as ProspectRow[]).map((p) => {
          const sub = ["Prospect", p.org_name, titleCase(p.type)].filter(Boolean).join(" · ");
          return mk("prospect", "people", p.id, p.name, `/admin/fundraising/prospects/${p.id}`, sub);
        })
      ),

    // Grants / deals pipeline.
    supabase
      .from("grants")
      .select("id, name, stage, amount_requested, owner")
      .or(`name.ilike.${like},program.ilike.${like},owner.ilike.${like}`)
      .limit(LIMIT)
      .then(({ data }) =>
        ((data ?? []) as GrantRow[]).map((g) => {
          const amt =
            g.amount_requested != null
              ? `$${Number(g.amount_requested).toLocaleString("en-US")}`
              : null;
          const sub = ["Grant", amt, g.owner].filter(Boolean).join(" · ");
          return mk("grant", "deals", g.id, g.name, `/admin/fundraising/grants`, sub, titleCase(g.stage));
        })
      ),

    // Revenue commitments (pledges / projected gifts).
    supabase
      .from("fin_revenue_commitments")
      .select("id, source_name, amount, status, year")
      .ilike("source_name", like)
      .limit(LIMIT)
      .then(({ data }) =>
        ((data ?? []) as CommitmentRow[]).map((c) => {
          const amt = c.amount != null ? `$${Number(c.amount).toLocaleString("en-US")}` : null;
          const sub = ["Commitment", amt, c.year].filter(Boolean).join(" · ");
          return mk(
            "commitment",
            "deals",
            c.id,
            c.source_name,
            `/admin/finance/revenue`,
            sub,
            titleCase(c.status)
          );
        })
      ),

    // Tasks (open tasks float to the top of their group via the boost below).
    supabase
      .from("ops_tasks")
      .select("id, title, status, priority, assigned_to")
      .or(`title.ilike.${like},description.ilike.${like}`)
      .is("archived_at", null)
      .limit(LIMIT)
      .then(({ data }) =>
        ((data ?? []) as TaskRow[]).map((t) => {
          const sub = ["Task", t.assigned_to ? titleCase(t.assigned_to) : null, titleCase(t.status)]
            .filter(Boolean)
            .join(" · ");
          const hit = mk(
            "task",
            "tasks",
            t.id,
            t.title,
            `/admin/ops`,
            sub,
            t.priority === "urgent" || t.priority === "high" ? titleCase(t.priority) : undefined
          );
          if (t.status !== "done") hit.score += 5; // open work ranks above closed
          return hit;
        })
      ),

    // Projects.
    supabase
      .from("ops_projects")
      .select("id, title, status, category")
      .or(`title.ilike.${like},description.ilike.${like}`)
      .limit(LIMIT)
      .then(({ data }) =>
        ((data ?? []) as ProjectRow[]).map((p) => {
          const sub = ["Project", titleCase(p.category), titleCase(p.status)].filter(Boolean).join(" · ");
          return mk("project", "tasks", p.id, p.title, `/admin/ops/projects/${p.id}`, sub);
        })
      ),

    // Partners (schools / orgs in the program pipeline).
    supabase
      .from("partners")
      .select("id, name, kind, status")
      .or(`name.ilike.${like},champion_name.ilike.${like},champion_email.ilike.${like}`)
      .limit(LIMIT)
      .then(({ data }) =>
        ((data ?? []) as PartnerRow[]).map((p) => {
          const sub = ["Partner", titleCase(p.kind)].filter(Boolean).join(" · ");
          return mk("partner", "program", p.id, p.name, `/admin/partners/${p.id}`, sub, titleCase(p.status));
        })
      ),

    // Students.
    supabase
      .from("students")
      .select("id, first_name, last_name, school, stage")
      .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},school.ilike.${like}`)
      .limit(LIMIT)
      .then(({ data }) =>
        ((data ?? []) as StudentRow[]).map((s) => {
          const name = [s.first_name, s.last_name].filter(Boolean).join(" ") || "Unnamed student";
          const sub = ["Student", s.school].filter(Boolean).join(" · ");
          return mk("student", "program", s.id, name, `/admin/students`, sub, titleCase(s.stage));
        })
      ),

    // Cohorts.
    supabase
      .from("cohorts")
      .select("id, name, program, term, status")
      .or(`name.ilike.${like},program.ilike.${like},term.ilike.${like},location.ilike.${like}`)
      .limit(LIMIT)
      .then(({ data }) =>
        ((data ?? []) as CohortRow[]).map((c) => {
          const sub = ["Cohort", c.term].filter(Boolean).join(" · ");
          return mk("cohort", "program", c.id, c.name, `/admin/cohorts/${c.id}`, sub, titleCase(c.status));
        })
      ),

    // Meetings / bookings.
    supabase
      .from("bookings")
      .select("id, attendee_name, attendee_email, start_time")
      .or(`attendee_name.ilike.${like},attendee_email.ilike.${like}`)
      .order("start_time", { ascending: false })
      .limit(LIMIT)
      .then(({ data }) =>
        ((data ?? []) as BookingRow[]).map((b) => {
          const when = b.start_time
            ? new Date(b.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : null;
          const sub = ["Meeting", b.attendee_email, when].filter(Boolean).join(" · ");
          return mk("booking", "meetings", b.id, b.attendee_name || "Meeting", `/admin/meetings`, sub);
        })
      ),
  ];

  const settled = await Promise.allSettled(tasks);
  const results: SearchHit[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") results.push(...r.value);
    else console.error("[admin/search] sub-query failed:", r.reason?.message ?? r.reason);
  }

  results.sort((a, b) => b.score - a.score);
  return NextResponse.json({ results });
}
