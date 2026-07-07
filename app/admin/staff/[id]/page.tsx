import { notFound } from "next/navigation";
import PageHeader from "../../_components/PageHeader";
import EmptyState from "../../_components/EmptyState";
import { StatusChip } from "../../_components/StatusChip";
import PhotoControl from "./_components/PhotoControl";
import DevelopmentSections from "./_components/DevelopmentSections";
import { getStaffMember, getStaffDevelopment } from "../_lib/read";
import { STAFF_METRIC_META } from "@/lib/admin/staff/metrics";

// A staff member's profile: identity + photo, and (labeled empty for now)
// Goals, KPIs, and Reviews. Sections fill in as Phases 2-3 land. Session client
// only; RLS gates the row and the signed photo URL.
export const dynamic = "force-dynamic";

const EMPLOYMENT_LABEL: Record<string, string> = {
  staff: "Staff",
  contractor: "Contractor",
  volunteer: "Volunteer",
  board: "Board",
};

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-xs uppercase tracking-[0.06em] text-ink-3">{label}</span>
      <span className="text-sm text-ink-1 text-right">{value}</span>
    </div>
  );
}

export default async function StaffProfilePage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const data = await getStaffMember(params.id);
  if (!data) notFound();
  const { member, managerName, photoUrl, canEditPhoto, canViewSensitive, isSelf } = data;

  const development = canViewSensitive ? await getStaffDevelopment(member.id) : null;
  const autoOptions = Object.entries(STAFF_METRIC_META).map(([key, m]) => ({
    key,
    label: m.label,
    unit: m.unit,
  }));

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <PageHeader
        title={member.full_name}
        subtitle={member.title ?? undefined}
        eyebrow="Staff"
      />

      <div className="grid gap-6 md:grid-cols-[220px_1fr] items-start">
        {/* Identity column: photo + facts */}
        <div className="flex flex-col gap-4">
          <PhotoControl
            memberId={member.id}
            fullName={member.full_name}
            userId={member.user_id}
            photoUrl={photoUrl}
            canEdit={canEditPhoto}
          />
          <div className="rounded-card border-[1.5px] border-outline bg-tile shadow-tile px-4 py-3">
            <MetaRow label="Reports to" value={managerName ?? "—"} />
            <MetaRow label="Department" value={member.department ?? "—"} />
            <MetaRow
              label="Type"
              value={EMPLOYMENT_LABEL[member.employment_type] ?? member.employment_type}
            />
            <MetaRow
              label="Status"
              value={
                <StatusChip status={member.status === "active" ? "healthy" : "neutral"}>
                  {member.status === "active" ? "Active" : "Inactive"}
                </StatusChip>
              }
            />
            {member.start_date ? (
              <MetaRow label="Started" value={member.start_date} />
            ) : null}
          </div>
        </div>

        {/* Development column: Goals / KPIs (Phase 2), Reviews (Phase 3) */}
        <div className="flex flex-col gap-8">
          {development ? (
            <DevelopmentSections
              staffId={member.id}
              goals={development.goals}
              kpis={development.kpis}
              canApprove={!isSelf}
              autoOptions={autoOptions}
            />
          ) : (
            <EmptyState
              label="development data"
              hint="Goals and KPIs are visible only to this person, their managers, and admins."
            />
          )}
        </div>
      </div>
    </div>
  );
}
