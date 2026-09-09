import PageSkeleton from "./_components/PageSkeleton";

// Quality Floor Q1 — the route-level loading state every admin route
// inherits (App Router nesting; heavy modules override with their own
// segment loading.tsx). Renders inside the shell: the sidebar, tab zone,
// and mobile bar stay painted while only the main column shows the
// page-shaped skeleton.
export default function AdminLoading() {
  return <PageSkeleton />;
}
