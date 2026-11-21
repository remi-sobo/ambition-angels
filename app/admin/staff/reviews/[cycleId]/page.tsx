import { notFound } from "next/navigation";
import PageHeader from "../../../_components/PageHeader";
import EmptyState from "../../../_components/EmptyState";
import RaterFormsClient from "./_components/RaterFormsClient";
import { getMyRaterForms, getReviewCompetencies } from "../../_lib/reviews";

// The current user's own 360 forms for a cycle — each rater sees only their own,
// enforced by RLS (rater_staff_id = me).
export const dynamic = "force-dynamic";

export default async function CycleFormsPage({ params }: { params: { cycleId: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.cycleId)) notFound();
  const [forms, competencies] = await Promise.all([
    getMyRaterForms(params.cycleId),
    getReviewCompetencies(),
  ]);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-reading">
      <PageHeader
        breadcrumb={[
          { label: "Team", href: "/admin/organization/team" },
          { label: "Reviews", href: "/admin/staff/reviews" },
        ]}
        title="Your review forms"
        subtitle="Only your own assignments are shown"
      />
      {forms.length === 0 ? (
        <EmptyState
          label="forms"
          hint="You have no forms in this cycle. An admin generates assignments from the org chart."
        />
      ) : (
        <RaterFormsClient forms={forms} competencies={competencies} />
      )}
    </div>
  );
}
