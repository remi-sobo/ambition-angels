import PageHeader from "../_components/PageHeader";
import EmptyState from "../_components/EmptyState";
import StaffChart from "./_components/StaffChart";
import StaffHeaderActions from "./_components/StaffHeaderActions";
import { getStaffTree, getPendingInvites, getStaffLabel } from "./_lib/read";

// The Staff org chart — Remi at the top, reports nested beneath, read from the
// `staff` table (adding/moving a person is a data op, no code change). Session
// client only; RLS gates the rows.
export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const [tree, pendingInvites, label] = await Promise.all([
    getStaffTree(),
    getPendingInvites(),
    getStaffLabel(),
  ]);

  if (!tree) {
    return (
      <div className="p-6 lg:p-8">
        <PageHeader title={label} subtitle="Org chart, profiles, goals, and reviews." />
        <EmptyState
          label="access"
          hint="You don't have access to the directory, or you're not signed in."
        />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        title={label}
        subtitle="The team, who reports to whom, and each person's profile."
        eyebrow={`${tree.count} ${tree.count === 1 ? "person" : "people"}`}
        actions={<StaffHeaderActions canManage={tree.canWrite} currentLabel={label} />}
      />
      {tree.count === 0 ? (
        <EmptyState
          label="staff"
          hint="No one is on the chart yet. Add people to the staff table and they appear here."
        />
      ) : (
        <StaffChart
          roots={tree.roots}
          orphans={tree.orphans}
          all={tree.all}
          canWrite={tree.canWrite}
          pendingInvites={pendingInvites}
        />
      )}
    </div>
  );
}
