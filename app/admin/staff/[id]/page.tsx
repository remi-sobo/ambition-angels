import { notFound } from "next/navigation";
import PageHeader from "../../_components/PageHeader";
import SectionHeading from "../../_components/SectionHeading";
import EmptyState from "../../_components/EmptyState";
import { StatusChip } from "../../_components/StatusChip";
import PhotoControl from "./_components/PhotoControl";
import { getStaffMember } from "../_lib/read";

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
  const { member, managerName, photoUrl, canEditPhoto } = data;

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

        {/* Development column: Goals / KPIs / Reviews (Phases 2-3) */}
        <div className="flex flex-col gap-8">
          <section>
            <SectionHeading className="mb-3">Goals</SectionHeading>
            <EmptyState
              label="Goals"
              hint="Period objectives for this person, optionally cascading from a strategy goal. Coming in Phase 2."
            />
          </section>
          <section>
            <SectionHeading className="mb-3">KPIs</SectionHeading>
            <EmptyState
              label="KPIs"
              hint="Recurring personal metrics with targets — some auto-read from the BloomOS spine. Coming in Phase 2."
            />
          </section>
          <section>
            <SectionHeading className="mb-3">Reviews</SectionHeading>
            <EmptyState
              label="Reviews"
              hint="360 review cycles: self, manager, upward, and peer feedback. Coming in Phase 3."
            />
          </section>
        </div>
      </div>
    </div>
  );
}
