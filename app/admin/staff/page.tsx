import Link from "next/link";
import PageHeader from "../_components/PageHeader";
import EmptyState from "../_components/EmptyState";
import OrgChart from "./_components/OrgChart";
import { getStaffTree } from "./_lib/read";

// The Staff org chart — Remi at the top, reports nested beneath, read from the
// `staff` table (adding/moving a person is a data op, no code change). Session
// client only; RLS gates the rows.
export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const tree = await getStaffTree();

  if (!tree) {
    return (
      <div className="p-6 lg:p-8">
        <PageHeader title="Staff" subtitle="Org chart, profiles, goals, and reviews." />
        <EmptyState
          label="access"
          hint="You don't have access to the Staff directory, or you're not signed in."
        />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title="Staff"
        subtitle="The team, who reports to whom, and each person's profile."
        eyebrow={`${tree.count} ${tree.count === 1 ? "person" : "people"}`}
        actions={
          <Link
            href="/admin/staff/reviews"
            className="rounded-md border border-outline px-3 py-1.5 text-sm font-semibold text-ink-1 hover:border-orange/50"
          >
            Reviews
          </Link>
        }
      />
      {tree.count === 0 ? (
        <EmptyState
          label="staff"
          hint="No one is on the chart yet. Add people to the staff table and they appear here."
        />
      ) : (
        <OrgChart roots={tree.roots} orphans={tree.orphans} />
      )}
    </div>
  );
}
