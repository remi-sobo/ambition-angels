import Link from "next/link";

export type SortKey = "name" | "last_activity" | "score";
export type SortDir = "asc" | "desc";

export type ProspectRow = {
  hubspot_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  lifecycle_stage: string | null;
  owner_id: string | null;
  last_activity_at: string | null;
  score_total: number | null;
};

// Default sort direction per column — clicking a different column starts
// at the direction most users want first.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  last_activity: "desc",
  score: "desc",
};

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function displayName(r: ProspectRow): string {
  const parts = [r.first_name, r.last_name].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  if (parts.length) return parts.join(" ");
  return r.email ?? "Unknown";
}

function SortHeader({
  label,
  col,
  align,
  current,
  dir,
  buildHref,
}: {
  label: string;
  col: SortKey;
  align?: "left" | "right";
  current: SortKey;
  dir: SortDir;
  buildHref: (s: SortKey, d: SortDir) => string;
}) {
  const isActive = current === col;
  const nextDir: SortDir = isActive
    ? dir === "asc"
      ? "desc"
      : "asc"
    : DEFAULT_DIR[col];
  const arrow = isActive ? (dir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th
      className={`text-${align ?? "left"} font-medium pb-2 pr-4 text-[10px] uppercase tracking-wider`}
    >
      <Link
        href={buildHref(col, nextDir)}
        className={`hover:text-cream ${isActive ? "text-orange" : "text-gray-mid"}`}
      >
        {label}
        <span>{arrow}</span>
      </Link>
    </th>
  );
}

export default function ProspectListTable({
  rows,
  sort,
  dir,
  buildSortHref,
}: {
  rows: ProspectRow[];
  sort: SortKey;
  dir: SortDir;
  buildSortHref: (s: SortKey, d: SortDir) => string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-white/10 bg-black/30 p-8 text-center text-sm text-gray-mid">
        No prospects match your filters.
      </div>
    );
  }

  return (
    <div className="rounded-card border border-white/10 bg-black/30 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10 bg-black/20">
            <tr>
              <SortHeader
                label="Name"
                col="name"
                current={sort}
                dir={dir}
                buildHref={buildSortHref}
              />
              <th className="text-left pb-2 pr-4 text-[10px] uppercase tracking-wider text-gray-mid font-medium">
                Email
              </th>
              <th className="text-left pb-2 pr-4 text-[10px] uppercase tracking-wider text-gray-mid font-medium">
                Company
              </th>
              <th className="text-left pb-2 pr-4 text-[10px] uppercase tracking-wider text-gray-mid font-medium">
                Lifecycle
              </th>
              <th className="text-left pb-2 pr-4 text-[10px] uppercase tracking-wider text-gray-mid font-medium">
                Owner ID
              </th>
              <SortHeader
                label="Last Activity"
                col="last_activity"
                current={sort}
                dir={dir}
                buildHref={buildSortHref}
              />
              <SortHeader
                label="Score"
                col="score"
                align="right"
                current={sort}
                dir={dir}
                buildHref={buildSortHref}
              />
            </tr>
            <tr>
              <th className="px-4 pt-1" colSpan={7}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr
                key={r.hubspot_id}
                className="hover:bg-white/5 transition-colors"
              >
                <td className="py-2.5 pl-4 pr-4">
                  <Link
                    href={`/admin/fundraising/prospects/${encodeURIComponent(r.hubspot_id)}`}
                    className="text-cream font-medium hover:text-orange block"
                  >
                    {displayName(r)}
                  </Link>
                </td>
                <td className="py-2.5 pr-4 text-cream/70 truncate max-w-[220px]">
                  {r.email ?? <span className="text-gray-mid">—</span>}
                </td>
                <td className="py-2.5 pr-4 text-cream/70 truncate max-w-[160px]">
                  {r.company ?? <span className="text-gray-mid">—</span>}
                </td>
                <td className="py-2.5 pr-4">
                  {r.lifecycle_stage ? (
                    <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-white/5 border border-white/10 text-cream/80">
                      {r.lifecycle_stage}
                    </span>
                  ) : (
                    <span className="text-gray-mid">—</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-cream/70 font-mono text-xs">
                  {r.owner_id ?? <span className="text-gray-mid">—</span>}
                </td>
                <td className="py-2.5 pr-4 text-cream/70">
                  {fmtRelative(r.last_activity_at)}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono">
                  {r.score_total !== null && r.score_total !== undefined ? (
                    <span className="text-orange font-semibold">
                      {r.score_total}
                    </span>
                  ) : (
                    <span className="text-gray-mid">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
