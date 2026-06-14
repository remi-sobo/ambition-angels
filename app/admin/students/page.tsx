import { getSupabaseAdmin } from "@/lib/supabase/admin";
import StatCard from "../_components/StatCard";
import PageHeader from "../_components/PageHeader";
import { StudentRow, NewStudentForm, type Student } from "./_components/StudentControls";
import { JOURNEY_STAGES, STAGE_ORDER, STAGE_LABELS } from "./_lib/stages";

// Student spine (Ring 3, modules/02-program.md "Students"): one roster for
// every teen across programs, organized by journey stage —
// discover → learn → practice → connect → launch. YGB campers and
// career-quiz teens are folded in by the create_students migration.
export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("students")
    .select("*")
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(500);
  const students = (data ?? []) as Student[];

  const byStage = (s: string) => students.filter((x) => x.stage === s);
  const active = students.filter((x) => x.stage !== "alumni" && x.stage !== "withdrawn");
  const engaged = active.filter((x) => x.stage !== "discover");
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const newThisMonth = students.filter(
    (x) => x.last_activity_at && x.last_activity_at >= monthAgo
  );
  const missingGuardian = engaged.filter((x) => !x.guardian_email && !x.guardian_phone);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pt-8 max-w-[1100px]">
      <PageHeader
        title="Students"
        subtitle="One roster across programs · journey from discover to launch"
        actions={<NewStudentForm />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="On the roster" value={active.length} sub={`${students.length} all-time`} />
        <StatCard label="Engaged (past discover)" value={engaged.length} sub="learn and beyond" />
        <StatCard
          label="Active this month"
          value={newThisMonth.length}
          sub="last 30 days"
          muted={newThisMonth.length === 0}
        />
        <StatCard
          label="Missing guardian contact"
          value={missingGuardian.length}
          sub="engaged students"
          muted={missingGuardian.length === 0}
        />
      </div>

      {/* Journey funnel */}
      <div className="grid grid-cols-5 gap-1.5 mb-8">
        {JOURNEY_STAGES.map((s, i) => {
          const n = byStage(s).length;
          return (
            <div
              key={s}
              className={`rounded-lg border px-2 py-2.5 text-center ${
                n > 0 ? "bg-orange/10 border-orange/30" : "bg-white/[0.03] border-white/10"
              }`}
            >
              <div className={`text-lg font-bold tabular-nums ${n > 0 ? "text-orange" : "text-gray-mid"}`}>
                {n}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-cream/60">
                {i + 1}. {STAGE_LABELS[s]}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-8">
        {STAGE_ORDER.map((stage) => {
          const rows = byStage(stage);
          if (rows.length === 0) return null;
          return (
            <section key={stage}>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70 mb-2">
                {STAGE_LABELS[stage]} ({rows.length})
              </h2>
              <div className="space-y-2">
                {rows.map((s) => (
                  <StudentRow key={s.id} student={s} />
                ))}
              </div>
            </section>
          );
        })}
        {students.length === 0 && (
          <p className="text-sm text-gray-mid">
            No students yet — add one above, or run the create_students migration to import YGB
            campers and career-quiz teens.
          </p>
        )}
      </div>
    </div>
  );
}
