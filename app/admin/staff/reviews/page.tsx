import PageHeader from "../../_components/PageHeader";
import EmptyState from "../../_components/EmptyState";
import ReviewsAdminClient from "./_components/ReviewsAdminClient";
import { getReviewsAdminData } from "../_lib/reviews";

// 360 review cycles admin — create a cycle, generate rater assignments from the
// chart, and see the small-team anonymity warning. Session client; RLS gates it.
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const data = await getReviewsAdminData();
  if (!data) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-reading">
        <PageHeader title="Reviews" subtitle="360 review cycles." />
        <EmptyState label="access" hint="You don't have access to reviews, or you're not signed in." />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-reading">
      <PageHeader
        breadcrumb={[{ label: "Team", href: "/admin/organization/team" }]}
        title="Reviews"
        subtitle="360 cycles: self, manager, upward, and peer feedback"
        moreActions={[{ label: "Org chart", href: "/admin/organization/team" }]}
      />
      <ReviewsAdminClient cycles={data.cycles} canManage={data.canManage} />
    </div>
  );
}
