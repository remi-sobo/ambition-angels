// Quality Floor Q1 (specs/bloomos-v2-spec-quality-floor.md) — the loading
// skeleton every admin route paints while its server component awaits data.
// PAGE-SHAPED, never a spinner: the blocks read the same proportions as
// PageHeader (title + subtitle, mb-6) and StatCard (tile, card-lg radius,
// p-5), so the skeleton has the real page's silhouette. The .qf-skeleton
// wrapper carries the 150ms appearance grace (decision 2, resolved): a fast
// load paints straight to content and never flashes.
//
// The shell (sidebar, tab zone, mobile bar) is NOT here — loading.tsx nests
// inside the admin layout, so the chrome stays painted and only the main
// column shows this.

function Bar({ className }: { className: string }) {
  return <div className={`rounded-md bg-outline/40 ${className}`} />;
}

export default function PageSkeleton({
  stats = 0,
  rows = 6,
}: {
  /** Stat-card band width (0 = none) — segment skeletons match their module. */
  stats?: number;
  /** List rows below the header. */
  rows?: number;
}) {
  return (
    <div className="qf-skeleton px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]" aria-busy>
      <div className="animate-pulse">
        {/* PageHeader silhouette */}
        <div className="mb-6">
          <Bar className="h-7 w-48" />
          <Bar className="mt-2 h-4 w-80 max-w-full" />
        </div>

        {/* StatCard band */}
        {stats > 0 && (
          <div
            className="grid gap-3 mb-6"
            style={{ gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))` }}
          >
            {Array.from({ length: stats }).map((_, i) => (
              <div
                key={i}
                className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5"
              >
                <Bar className="h-3 w-20" />
                <Bar className="mt-3 h-7 w-16" />
              </div>
            ))}
          </div>
        )}

        {/* List rows */}
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 rounded-card border border-outline bg-surface"
            >
              <Bar className="h-4 w-24 shrink-0" />
              <Bar className="h-4 flex-1" />
              <Bar className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
