import type { ReactNode } from "react";

/**
 * Skeleton blocks for in-page loading (spec §6 States: "skeleton for
 * loading"). Each one has the silhouette of the component it stands in for,
 * so a load settles into the same shape it painted:
 *
 *   <SkeletonHeader />        PageHeader v2 (breadcrumb, title, chips, actions)
 *   <SkeletonStrip count={4}/> SummaryStrip of Figures
 *   <SkeletonFigure />        one Figure cell
 *   <SkeletonTable rows={6}/>  a table panel
 *   <SkeletonTimeline rows={4}/> the Timeline panel
 *
 * Every block is aria-hidden; the <SkeletonGroup> wrapper carries aria-busy
 * and one "Loading" line for screen readers. Pulse is motion-safe only.
 * Route-level loading stays <PageSkeleton> (loading.tsx).
 */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block rounded-control bg-hairline ${className}`} />;
}

export function SkeletonGroup({ children, label = "Loading" }: { children: ReactNode; label?: string }) {
  return (
    <div aria-busy="true" className="motion-safe:animate-pulse">
      <span className="sr-only" role="status">
        {label}
      </span>
      {children}
    </div>
  );
}

export function SkeletonHeader({ breadcrumb = false, chips = false }: { breadcrumb?: boolean; chips?: boolean }) {
  return (
    <div aria-hidden className="mb-5">
      {breadcrumb ? <SkeletonBlock className="h-3.5 w-40 mb-3" /> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SkeletonBlock className="h-8 w-56" />
          {chips ? (
            <div className="flex gap-2 mt-3">
              <SkeletonBlock className="h-7 w-20 !rounded-full" />
              <SkeletonBlock className="h-7 w-24 !rounded-full" />
              <SkeletonBlock className="h-7 w-28 !rounded-full" />
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <SkeletonBlock className="h-11 w-11" />
          <SkeletonBlock className="h-11 w-36" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonFigure() {
  return (
    <div aria-hidden className="px-5 py-4">
      <SkeletonBlock className="h-3.5 w-28" />
      <SkeletonBlock className="h-7 w-24 mt-2" />
      <SkeletonBlock className="h-3 w-36 mt-2" />
    </div>
  );
}

export function SkeletonStrip({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-hidden
      className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] bg-surface border border-hairline rounded-panel mb-4"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonFigure key={i} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div aria-hidden className="bg-surface border border-hairline rounded-panel overflow-hidden">
      <div className="flex gap-4 px-5 py-3 border-b border-hairline">
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonBlock key={i} className={`h-3 ${i === 0 ? "w-32" : "flex-1"}`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-5 py-3.5 border-b border-hairline last:border-b-0">
          <div className="w-32 shrink-0">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-3 w-20 mt-1.5" />
          </div>
          {Array.from({ length: columns - 1 }).map((_, c) => (
            <SkeletonBlock key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonTimeline({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden className="bg-surface border border-hairline rounded-panel">
      <div className="flex justify-between px-5 pt-4 pb-3">
        <SkeletonBlock className="h-5 w-24" />
        <SkeletonBlock className="h-8 w-56 !rounded-full" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 px-5 py-4 border-t border-hairline">
          <SkeletonBlock className="h-8 w-8 shrink-0 !rounded-full" />
          <div className="flex-1">
            <SkeletonBlock className="h-4 w-1/2" />
            <SkeletonBlock className="h-3 w-3/4 mt-2" />
          </div>
          <SkeletonBlock className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}
