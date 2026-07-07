import Link from "next/link";
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
      <div className="p-6 lg:p-8">
        <PageHeader title="Reviews" subtitle="360 review cycles." />
        <EmptyState label="access" hint="You don't have access to reviews, or you're not signed in." />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <PageHeader
        title="Reviews"
        subtitle="360 cycles: self, manager, upward, and peer feedback."
        eyebrow="Staff"
        actions={
          <Link href="/admin/staff" className="text-xs font-semibold text-ink-2 hover:text-orange">
            ← Org chart
          </Link>
        }
      />
      <ReviewsAdminClient cycles={data.cycles} canManage={data.canManage} />
    </div>
  );
}
