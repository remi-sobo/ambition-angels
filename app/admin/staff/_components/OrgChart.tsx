import Link from "next/link";
import { Avatar } from "../../messages/_components/Avatar";
import type { StaffNode } from "../_lib/read";

/**
 * The org chart — a nested tree read from the flat staff rows. Each node is a
 * card (the house tile look) linking to /admin/staff/[id]; children indent under
 * their manager with a connector rail. Signed photo URLs aren't fetched for the
 * chart (that'd be N signed-URL round-trips) — nodes use the initials Avatar,
 * which is the same primitive Messages uses, so a person wears a stable color.
 */

function PersonNode({ node }: { node: StaffNode }) {
  return (
    <li className="relative">
      <Link
        href={`/admin/staff/${node.id}`}
        className="group inline-flex items-center gap-3 rounded-card border-[1.5px] border-outline bg-tile shadow-tile px-3 py-2 hover:border-orange/50 transition-colors"
      >
        <Avatar name={node.full_name} id={node.user_id} size={36} />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink-1 truncate group-hover:text-orange">
            {node.full_name}
          </span>
          {node.title ? (
            <span className="block text-xs text-ink-2 truncate">{node.title}</span>
          ) : null}
        </span>
      </Link>
      {node.reports.length > 0 ? (
        <ul className="mt-3 ml-5 pl-5 border-l border-outline flex flex-col gap-3">
          {node.reports.map((child) => (
            <PersonNode key={child.id} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function OrgChart({
  roots,
  orphans,
}: {
  roots: StaffNode[];
  orphans: StaffNode[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-3">
        {roots.map((node) => (
          <PersonNode key={node.id} node={node} />
        ))}
      </ul>
      {orphans.length > 0 ? (
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 mb-2">
            Not on the chart
          </p>
          <ul className="flex flex-col gap-3">
            {orphans.map((node) => (
              <PersonNode key={node.id} node={node} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
