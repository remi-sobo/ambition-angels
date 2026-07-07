"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "../../messages/_components/Avatar";
import type { StaffNode, StaffRow, PendingInvite } from "../_lib/read";

/**
 * The org chart (Phase 4): employment-type badges, department, a department/type
 * filter, pending-invite ghost nodes, and — for staff.write holders — an Arrange
 * mode with drag-to-reparent and drag-to-reorder (siblings). Non-admins and the
 * filtered view fall back to a plain read-only render.
 */

const EMPLOYMENT_BADGE: Record<string, { label: string; cls: string }> = {
  contractor: { label: "Contractor", cls: "bg-status-watch-bg text-ink-1" },
  volunteer: { label: "Volunteer", cls: "bg-status-healthy-bg text-ink-1" },
  board: { label: "Board", cls: "bg-status-neutral-bg text-ink-1" },
};

function Badge({ type }: { type: string }) {
  const b = EMPLOYMENT_BADGE[type];
  if (!b) return null;
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${b.cls}`}>{b.label}</span>;
}

function PersonCard({
  node,
  draggable,
  onDragStart,
  onDrop,
  dragging,
}: {
  node: StaffRow;
  draggable: boolean;
  onDragStart?: (id: string) => void;
  onDrop?: (targetId: string) => void;
  dragging?: string | null;
}) {
  const [over, setOver] = useState(false);
  return (
    <Link
      href={`/admin/staff/${node.id}`}
      draggable={draggable}
      onDragStart={draggable ? (e) => { e.stopPropagation(); onDragStart?.(node.id); } : undefined}
      onDragOver={draggable ? (e) => { e.preventDefault(); setOver(true); } : undefined}
      onDragLeave={draggable ? () => setOver(false) : undefined}
      onDrop={draggable ? (e) => { e.preventDefault(); setOver(false); onDrop?.(node.id); } : undefined}
      className={`group inline-flex items-center gap-3 rounded-card border-[1.5px] px-3 py-2 shadow-tile transition-colors ${
        over && dragging && dragging !== node.id
          ? "border-orange bg-orange-light"
          : "border-outline bg-tile hover:border-orange/50"
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <Avatar name={node.full_name} id={node.user_id} size={36} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-ink-1 truncate group-hover:text-orange">{node.full_name}</span>
          <Badge type={node.employment_type} />
        </span>
        {node.title ? <span className="block text-xs text-ink-2 truncate">{node.title}</span> : null}
        {node.department ? <span className="block text-[11px] text-ink-3 truncate">{node.department}</span> : null}
      </span>
    </Link>
  );
}

function TreeNode(props: {
  node: StaffNode;
  draggable: boolean;
  onDragStart?: (id: string) => void;
  onDrop?: (targetId: string) => void;
  dragging?: string | null;
}) {
  const { node, ...rest } = props;
  return (
    <li>
      <PersonCard node={node} {...rest} />
      {node.reports.length > 0 && (
        <ul className="mt-3 ml-5 pl-5 border-l border-outline flex flex-col gap-3">
          {node.reports.map((c) => (
            <TreeNode key={c.id} node={c} {...rest} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function StaffChart({
  roots,
  orphans,
  all,
  canWrite,
  pendingInvites,
}: {
  roots: StaffNode[];
  orphans: StaffNode[];
  all: StaffRow[];
  canWrite: boolean;
  pendingInvites: PendingInvite[];
}) {
  const router = useRouter();
  const [dept, setDept] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [arrange, setArrange] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(all.map((r) => [r.id, r])), [all]);
  const departments = useMemo(
    () => Array.from(new Set(all.map((r) => r.department).filter((d): d is string => !!d))).sort(),
    [all]
  );
  const filtering = dept !== "" || type !== "";
  const filtered = useMemo(
    () => all.filter((r) => (dept === "" || r.department === dept) && (type === "" || r.employment_type === type)),
    [all, dept, type]
  );

  // Is `ancestorId` at or above `nodeId` in the chain? Guards against cycles.
  function isAncestor(ancestorId: string, nodeId: string): boolean {
    let cur: string | null = nodeId;
    let hops = 0;
    while (cur && hops++ < 100) {
      if (cur === ancestorId) return true;
      cur = byId.get(cur)?.reports_to ?? null;
    }
    return false;
  }

  async function post(url: string, bodyObj: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: url.endsWith("/reorder") ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj),
      });
      if (res.ok) router.refresh();
      else alert(((await res.json().catch(() => null)) as { error?: string })?.error ?? "Failed.");
    } finally {
      setBusy(false);
      setDragging(null);
    }
  }

  function handleDrop(targetId: string) {
    const draggedId = dragging;
    if (!draggedId || draggedId === targetId) return setDragging(null);
    const dragged = byId.get(draggedId);
    const target = byId.get(targetId);
    if (!dragged || !target) return setDragging(null);
    // Can't move a node under its own descendant.
    if (isAncestor(draggedId, targetId)) {
      alert("Can't move a person under one of their own reports.");
      return setDragging(null);
    }
    if ((dragged.reports_to ?? null) === (target.reports_to ?? null)) {
      // Same manager → reorder: place dragged just before target.
      const siblings = all
        .filter((r) => (r.reports_to ?? null) === (dragged.reports_to ?? null))
        .sort((a, b) => a.sort_order - b.sort_order || a.full_name.localeCompare(b.full_name))
        .map((r) => r.id)
        .filter((id) => id !== draggedId);
      const at = siblings.indexOf(targetId);
      siblings.splice(at, 0, draggedId);
      void post("/api/admin/staff/reorder", { orderedIds: siblings });
    } else {
      // Different manager → reparent under target.
      void post(`/api/admin/staff/${draggedId}`, { reports_to: targetId });
    }
  }

  const dragProps = arrange
    ? { draggable: true, onDragStart: setDragging, onDrop: handleDrop, dragging }
    : { draggable: false };

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className="rounded-md border border-outline bg-surface px-2 py-1 text-sm text-ink-1"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-md border border-outline bg-surface px-2 py-1 text-sm text-ink-1"
        >
          <option value="">All types</option>
          <option value="staff">Staff</option>
          <option value="contractor">Contractor</option>
          <option value="volunteer">Volunteer</option>
          <option value="board">Board</option>
        </select>
        {canWrite && !filtering && (
          <button
            type="button"
            onClick={() => setArrange((v) => !v)}
            disabled={busy}
            className={`ml-auto rounded-md px-3 py-1 text-sm font-semibold ${
              arrange ? "bg-orange text-white" : "border border-outline text-ink-1 hover:border-orange/50"
            }`}
          >
            {arrange ? "Done arranging" : "Arrange"}
          </button>
        )}
      </div>

      {arrange && (
        <p className="text-xs text-ink-2 -mt-3">
          Drag a person onto another to change their manager, or onto a teammate under the same manager to reorder.
        </p>
      )}

      {/* Chart or filtered list */}
      {filtering ? (
        <ul className="flex flex-col gap-3">
          {filtered.length === 0 ? (
            <li className="text-sm text-ink-2">No one matches this filter.</li>
          ) : (
            filtered.map((r) => (
              <li key={r.id}>
                <PersonCard node={r} draggable={false} />
              </li>
            ))
          )}
        </ul>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {roots.map((n) => (
              <TreeNode key={n.id} node={n} {...dragProps} />
            ))}
          </ul>
          {orphans.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 mb-2">Not on the chart</p>
              <ul className="flex flex-col gap-3">
                {orphans.map((n) => (
                  <TreeNode key={n.id} node={n} {...dragProps} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Pending-invite ghost nodes */}
      {pendingInvites.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 mb-2">Pending invites</p>
          <ul className="flex flex-wrap gap-3">
            {pendingInvites.map((inv) => (
              <li
                key={inv.id}
                className="inline-flex items-center gap-3 rounded-card border border-dashed border-outline bg-tile/40 px-3 py-2"
              >
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-light text-ink-3 text-xs font-bold">
                  ?
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-2 truncate">{inv.email}</span>
                  <span className="block text-[11px] text-ink-3">Invited · {inv.role}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
