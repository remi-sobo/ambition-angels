import { getSupabaseAdmin } from "@/lib/supabase/admin";
import SectionHeading from "../_components/SectionHeading";
import StageStrip from "../_components/StageStrip";
import StatCard from "../_components/StatCard";
import PageHeader from "../_components/PageHeader";
import SectionSummary from "../_components/SectionSummary";
import { StudentRow, NewStudentForm, type Student } from "./_components/StudentControls";
import { getParticipantStages } from "@/lib/admin/program/stages";
import { getOrgContext } from "@/lib/admin/auth";
import { getFieldDefs } from "@/lib/admin/customFields";
import { getProgramTerms, getTermLabel } from "@/lib/admin/terminology";

// Participant roster (program spine, spec #4): one roster across programs,
// organized by the org's journey stages. The stage vocabulary is per-org
// DATA (participant_stages) — labels, order, which stages count as engaged,
// and which are terminal all come from the table, not a hardcoded array.
export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const supabase = getSupabaseAdmin();
  const ctx = await getOrgContext();
  const [{ data }, stages, customFieldDefs, terms, volunteerTerm, { data: leaderRows }] =
    await Promise.all([
      // Org fence: service-role client bypasses RLS, so the roster MUST filter
      // by the active org. No session → no roster.
      ctx
        ? supabase
            .from("students")
            .select("*")
            .eq("org_id", ctx.orgId)
            .order("last_activity_at", { ascending: false, nullsFirst: false })
            .limit(500)
        : Promise.resolve({ data: [] }),
      getParticipantStages(),
      // Per-org participant custom fields (empty for AA — the forms render as
      // before until an org seeds defs).
      ctx ? getFieldDefs(ctx.orgId, "student") : Promise.resolve([]),
      getProgramTerms(),
      getTermLabel("volunteer", "Volunteer"),
      // Volunteer-flagged constituents feed the kid→leader picker; empty for
      // orgs with no volunteers (the picker simply doesn't render).
      ctx
        ? supabase
            .from("constituents")
            .select("id, first_name, last_name, org_name")
            .eq("org_id", ctx.orgId)
            .eq("is_volunteer", true)
            .is("archived_at", null)
            .order("last_name", { ascending: true, nullsFirst: false })
            .limit(200)
        : Promise.resolve({ data: [] }),
    ]);
  const students = (data ?? []) as Student[];
  const leaders = ((leaderRows ?? []) as {
    id: string; first_name: string | null; last_name: string | null; org_name: string | null;
  }[]).map((l) => ({
    id: l.id,
    name: [l.first_name, l.last_name].filter(Boolean).join(" ") || l.org_name || "(no name)",
  }));

  const journey = stages.filter((s) => !s.terminal);
  const engagedKeys = new Set(stages.filter((s) => s.engaged).map((s) => s.stage_key));
  const terminalKeys = new Set(stages.filter((s) => s.terminal).map((s) => s.stage_key));
  const stageOptions = stages.map((s) => ({
    stage_key: s.stage_key, label: s.label, terminal: s.terminal, description: s.description,
  }));

  const byStage = (s: string) => students.filter((x) => x.stage === s);
  const active = students.filter((x) => !terminalKeys.has(x.stage));
  const engaged = active.filter((x) => engagedKeys.has(x.stage));
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const newThisMonth = students.filter(
    (x) => x.last_activity_at && x.last_activity_at >= monthAgo
  );
  // Guardian contact is a registry field now (custom_fields), keyed like the
  // AA defs seeded in D2.
  const guardian = (x: Student, k: "guardian_email" | "guardian_phone") =>
    (x.custom_fields?.[k] as string | undefined) || "";
  const missingGuardian = engaged.filter(
    (x) => !guardian(x, "guardian_email") && !guardian(x, "guardian_phone")
  );

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title={terms.students}
        subtitle={`One roster across ${terms.programs.toLowerCase()} · organized by ${terms.stage.toLowerCase()}`}
        actions={
          <>
            <a href="/admin/imports"
              className="text-xs font-semibold text-ink-2 bg-tile hover:bg-[#EFE6D4] px-4 py-2 rounded-full transition-colors">
              Import CSV
            </a>
            <NewStudentForm customFieldDefs={customFieldDefs} stages={stageOptions} term={terms.student}
              leaders={leaders} volunteerTerm={volunteerTerm} />
          </>
        }
      />

      <SectionSummary section="students" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="On the roster" value={active.length} sub={`${students.length} all-time`} />
        <StatCard label="Engaged" value={engaged.length} sub="in an engaged stage" />
        <StatCard
          label="Active this month"
          value={newThisMonth.length}
          sub="last 30 days"
          muted={newThisMonth.length === 0}
        />
        <StatCard
          label="Missing guardian contact"
          value={missingGuardian.length}
          sub={`engaged ${terms.students.toLowerCase()}`}
          muted={missingGuardian.length === 0}
        />
      </div>

      {/* Journey funnel — one cell per non-terminal stage, org-defined */}
      <StageStrip
        className="mb-8"
        cells={journey.map((s, i) => {
          const n = byStage(s.stage_key).length;
          return {
            key: s.stage_key,
            label: `${i + 1}. ${s.label}`,
            value: n,
            active: n > 0,
            title: s.description ?? undefined,
          };
        })}
      />

      <div className="space-y-8">
        {stages.map((stage) => {
          const rows = byStage(stage.stage_key);
          if (rows.length === 0) return null;
          return (
            <section key={stage.stage_key}>
              <SectionHeading className="mb-2">
                {stage.label} ({rows.length})
              </SectionHeading>
              <div className="space-y-2">
                {rows.map((s) => (
                  <StudentRow key={s.id} student={s} stages={stageOptions} customFieldDefs={customFieldDefs}
                    term={terms.student} leaders={leaders} volunteerTerm={volunteerTerm} />
                ))}
              </div>
            </section>
          );
        })}
        {students.length === 0 && (
          <p className="text-sm text-ink-2">
            No {terms.students.toLowerCase()} yet — add one above, or run the create_students
            migration to import YGB campers and career-quiz teens.
          </p>
        )}
      </div>
    </div>
  );
}
