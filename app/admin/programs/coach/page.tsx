import SectionHeading from "@/app/admin/_components/SectionHeading";
import PageHeader from "@/app/admin/_components/PageHeader";
import StatCard from "@/app/admin/_components/StatCard";
import EmptyState from "@/app/admin/_components/EmptyState";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { privateUrl, type CoachPerson, type CoachSession } from "@/lib/coach/server";
import { fullName, planProgress, toPlan, type MatchStatus, type PersonStatus } from "@/lib/coach/program";
import { MatchRow, NewMatchForm, PersonRow, type MatchView, type PersonView } from "./_components/CoachControls";

// Ambition Coach (BloomOS → Programs → Coach). Everyone who signs up on
// /coach, as a coach or a student, lands here. Staff match them, send the
// intro, and watch sessions and plans fill in from the private pages.
// Fenced by aa.coach (layout.tsx); every read is scoped to the session org.
export const dynamic = "force-dynamic";

type MatchRecord = {
  id: string;
  coach_id: string;
  student_id: string;
  status: MatchStatus;
  intro_sent_at: string | null;
  plan: unknown;
  plan_updated_at: string | null;
  plan_shared_at: string | null;
  coach_reaction: string | null;
  created_at: string;
};

const OPEN_MATCH: MatchStatus[] = ["proposed", "intro_sent", "active"];

export default async function CoachAdminPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Ambition Coach" subtitle="Sign in to view sign-ups." />
      </div>
    );
  }
  const orgId = ctx.orgId;
  const db = getSupabaseAdmin();
  const [{ data: peopleData }, { data: matchData }, { data: sessionData }] = await Promise.all([
    db.from("coach_people").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
    db.from("coach_matches").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
    db
      .from("coach_sessions")
      .select("id, match_id, n, scheduled_on, done_at, student_note, coach_note")
      .eq("org_id", orgId)
      .order("n"),
  ]);
  const people = (peopleData ?? []) as CoachPerson[];
  const matches = (matchData ?? []) as MatchRecord[];
  const sessions = (sessionData ?? []) as CoachSession[];
  const byId = new Map(people.map((p) => [p.id, p]));

  const detailOf = (p: CoachPerson) =>
    p.kind === "coach"
      ? [p.role, p.company].filter(Boolean).join(" at ")
      : [p.age ? `${p.age}` : null, p.school, p.program].filter(Boolean).join(" · ");

  const toPerson = (p: CoachPerson): PersonView => ({
    id: p.id,
    kind: p.kind,
    name: fullName(p),
    email: p.email,
    phone: p.phone,
    field: p.field,
    detail: detailOf(p),
    linkedin: p.linkedin,
    goal: p.goal,
    timing: p.timing,
    referral: p.referral,
    note: p.note,
    staff_note: p.staff_note,
    status: p.status as PersonStatus,
    created_at: p.created_at,
    link_sent_at: p.link_sent_at,
    last_seen_at: p.last_seen_at,
    url: privateUrl(p.access_token),
  });

  const matchViews: MatchView[] = matches
    .filter((m) => byId.has(m.coach_id) && byId.has(m.student_id))
    .map((m) => {
      const coach = byId.get(m.coach_id)!;
      const student = byId.get(m.student_id)!;
      const plan = toPlan(m.plan);
      const { filled, total } = planProgress(plan);
      return {
        id: m.id,
        status: m.status,
        coach: { id: coach.id, name: fullName(coach), detail: detailOf(coach), url: privateUrl(coach.access_token) },
        student: { id: student.id, name: fullName(student), detail: detailOf(student), url: privateUrl(student.access_token) },
        field: student.field,
        intro_sent_at: m.intro_sent_at,
        sessions: [1, 2, 3, 4].map((n) => {
          const s = sessions.find((x) => x.match_id === m.id && x.n === n);
          return {
            n,
            scheduled_on: s?.scheduled_on ?? null,
            done_at: s?.done_at ?? null,
            student_note: s?.student_note ?? null,
            coach_note: s?.coach_note ?? null,
          };
        }),
        plan,
        planFilled: filled,
        planTotal: total,
        plan_updated_at: m.plan_updated_at,
        plan_shared_at: m.plan_shared_at,
        coach_reaction: m.coach_reaction,
        created_at: m.created_at,
      };
    });

  const openMatches = matchViews.filter((m) => OPEN_MATCH.includes(m.status));
  const closedMatches = matchViews.filter((m) => !OPEN_MATCH.includes(m.status));
  const studentsInOpen = new Set(matches.filter((m) => OPEN_MATCH.includes(m.status)).map((m) => m.student_id));

  const coaches = people.filter((p) => p.kind === "coach");
  const students = people.filter((p) => p.kind === "student");
  const matchable = (p: CoachPerson) => p.status !== "not_now" && p.status !== "done";
  const coachOptions = coaches
    .filter(matchable)
    .map((c) => ({ id: c.id, label: `${fullName(c)} · ${c.field}${c.company ? ` · ${c.company}` : ""}` }));
  const studentOptions = students
    .filter((s) => matchable(s) && !studentsInOpen.has(s.id))
    .map((s) => ({ id: s.id, label: `${fullName(s)} · ${s.field}` }));

  const sessionsDone = matchViews.reduce((n, m) => n + m.sessions.filter((s) => s.done_at).length, 0);
  const plansReady = matchViews.filter((m) => m.plan_shared_at).length;
  const newCount = people.filter((p) => p.status === "new").length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-workspace">
      <PageHeader
        title="Ambition Coach"
        subtitle="Sign-ups from /coach · talk → match → intro → four sessions → Ambition Plan"
        actions={
          <a
            href="/coach"
            target="_blank"
            className="text-xs font-semibold text-ink-2 bg-tile hover:bg-tile px-4 py-2 rounded-full transition-colors"
          >
            View public page ↗
          </a>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Coaches" value={coaches.length} sub={`${newCount} new sign-ups to call`} muted={coaches.length === 0} />
        <StatCard label="Students" value={students.length} sub={`${studentOptions.length} waiting for a match`} muted={students.length === 0} />
        <StatCard label="Sessions done" value={sessionsDone} sub={`across ${openMatches.length} open matches`} muted={sessionsDone === 0} />
        <StatCard label="Plans ready" value={plansReady} sub="marked ready by the student" muted={plansReady === 0} />
      </div>

      <div className="space-y-8">
        <section>
          <SectionHeading className="mb-2">Matches ({openMatches.length})</SectionHeading>
          <div className="space-y-2">
            <NewMatchForm coaches={coachOptions} students={studentOptions} />
            {openMatches.map((m) => (
              <MatchRow key={m.id} m={m} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeading className="mb-2">Students ({students.length})</SectionHeading>
          {students.length === 0 ? (
            <EmptyState label="students" hint="Students sign up at /coach by picking “I want a coach.” Share /coach?as=student with partners like EOYDC." />
          ) : (
            <div className="space-y-2">
              {students.map((p) => (
                <PersonRow key={p.id} p={toPerson(p)} />
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeading className="mb-2">Coaches ({coaches.length})</SectionHeading>
          {coaches.length === 0 ? (
            <EmptyState label="coaches" hint="Coaches sign up at /coach. The Ambition update links there." />
          ) : (
            <div className="space-y-2">
              {coaches.map((p) => (
                <PersonRow key={p.id} p={toPerson(p)} />
              ))}
            </div>
          )}
        </section>

        {closedMatches.length > 0 && (
          <section>
            <SectionHeading className="mb-2">Finished and ended ({closedMatches.length})</SectionHeading>
            <div className="space-y-2">
              {closedMatches.map((m) => (
                <MatchRow key={m.id} m={m} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
