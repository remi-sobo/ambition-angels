import Link from "next/link";
import type { ResolvedEntity } from "@/lib/admin/entities";

// Operating Spine — shared linked-entity chip. Purely presentational: callers
// resolve the reference server-side via resolveEntity()/resolveEntities()
// (lib/admin/entities.ts) and hand the result here, so every page renders a
// polymorphic (type, id) link the same way. Unknown/unroutable types come
// through with url:null and render as a plain labeled chip — the registry-
// drift guard — never a dead link.
export default function EntityChip({
  entity,
  className = "",
}: {
  entity: Pick<ResolvedEntity, "label" | "typeLabel" | "url">;
  className?: string;
}) {
  const body = (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">
        {entity.typeLabel}
      </span>
      <span className="truncate">{entity.label}</span>
    </>
  );
  const base =
    "inline-flex max-w-full items-center gap-1.5 rounded-full border border-outline bg-tile px-2.5 py-1 text-xs font-medium text-ink-1";

  if (!entity.url) {
    return <span className={`${base} ${className}`}>{body}</span>;
  }
  return (
    <Link
      href={entity.url}
      className={`${base} transition-colors hover:border-orange/40 hover:text-orange ${className}`}
    >
      {body}
    </Link>
  );
}
