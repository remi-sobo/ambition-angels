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
        className={`hover:text-ink-1 ${isActive ? "text-orange" : "text-ink-2"}`}
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
      <div className="rounded-card border-[1.5px] border-outline bg-surface p-8 text-center text-sm text-ink-2">
        No prospects match your filters.
      </div>
    );
  }

  return (
    <div className="rounded-card border-[1.5px] border-outline bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-outline bg-tile">
            <tr>
              <SortHeader
                label="Name"
                col="name"
                current={sort}
                dir={dir}
                buildHref={buildSortHref}
              />
              <th className="text-left pb-2 pr-4 text-[10px] uppercase tracking-wider text-ink-2 font-medium">
                Email
              </th>
              <th className="text-left pb-2 pr-4 text-[10px] uppercase tracking-wider text-ink-2 font-medium">
                Company
              </th>
              <th className="text-left pb-2 pr-4 text-[10px] uppercase tracking-wider text-ink-2 font-medium">
                Lifecycle
              </th>
              <th className="text-left pb-2 pr-4 text-[10px] uppercase tracking-wider text-ink-2 font-medium">
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
          <tbody className="divide-y divide-hairline">
            {rows.map((r) => (
              <tr
                key={r.hubspot_id}
                className="hover:bg-[#EFE6D4] transition-colors"
              >
                <td className="py-2.5 pl-4 pr-4">
                  <Link
                    href={`/admin/fundraising/prospects/${encodeURIComponent(r.hubspot_id)}`}
                    className="text-ink-1 font-medium hover:text-orange block"
                  >
                    {displayName(r)}
                  </Link>
                </td>
                <td className="py-2.5 pr-4 text-ink-2 truncate max-w-[220px]">
                  {r.email ?? <span className="text-ink-2">—</span>}
                </td>
                <td className="py-2.5 pr-4 text-ink-2 truncate max-w-[160px]">
                  {r.company ?? <span className="text-ink-2">—</span>}
                </td>
                <td className="py-2.5 pr-4">
                  {r.lifecycle_stage ? (
                    <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-tile border-[1.5px] border-outline text-ink-1">
                      {r.lifecycle_stage}
                    </span>
                  ) : (
                    <span className="text-ink-2">—</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-ink-2 font-mono text-xs">
                  {r.owner_id ?? <span className="text-ink-2">—</span>}
                </td>
                <td className="py-2.5 pr-4 text-ink-2">
                  {fmtRelative(r.last_activity_at)}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono">
                  {r.score_total !== null && r.score_total !== undefined ? (
                    <span className="text-orange font-semibold">
                      {r.score_total}
                    </span>
                  ) : (
                    <span className="text-ink-2">—</span>
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
