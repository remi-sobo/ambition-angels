import PageSkeleton from "@/app/admin/_components/PageSkeleton";

// Quality Floor Q1 — segment skeleton: this module's screens open with a
// stat band, so its skeleton matches that silhouette (overrides the
// admin-level loading.tsx by App Router nesting).
export default function Loading() {
  return <PageSkeleton stats={3} rows={8} />;
}
