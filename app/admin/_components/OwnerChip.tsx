"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import MoreActionsMenu from "./ui/MoreActionsMenu";
import { ownerLabel, ownerOptions, type OrgMember } from "@/lib/admin/owners";
import type { OwnedTable } from "@/lib/database.types";

/**
 * The owner of a donor, ask, cohort or program (V4 Stage B2).
 *
 *   <OwnerChip entity="constituents" id={c.id} ownerId={c.owner_id}
 *     members={members} meId={ctx.userId} canEdit />
 *
 * Shows the member's display name, or the free-text fallback (asks.owner)
 * while owner_id is empty, or "Unassigned". With `canEdit`, a "Change" menu
 * (members of the active org only, "Unassigned" first) saves through
 * saveAction to /api/admin/assign/{entity}; the chip updates at once and rolls
 * back if the server says no. `variant="compact"` is the card form (Pipeline).
 */
export default function OwnerChip({
  entity,
  id,
  ownerId,
  fallbackText,
  members,
  meId,
  canEdit = false,
  variant = "chip",
}: {
  entity: OwnedTable;
  id: string;
  ownerId: string | null;
  fallbackText?: string | null;
  members: OrgMember[];
  meId?: string | null;
  canEdit?: boolean;
  variant?: "chip" | "compact";
}) {
  const router = useRouter();
  const save = useSaveAction();
  const [current, setCurrent] = useState<string | null>(ownerId);
  const [busy, setBusy] = useState(false);

  const name = ownerLabel(current, members, fallbackText);
  const shown = name ?? "Unassigned";

  async function choose(next: string | null) {
    if (next === current || busy) return;
    const before = current;
    setBusy(true);
    const nextName = ownerLabel(next, members) ?? "nobody";
    const r = await save({
      request: { url: `/api/admin/assign/${entity}`, method: "POST", body: { ids: [id], owner_id: next } },
      // Ownership is not money: showing the new owner at once is safe to undo.
      optimistic: () => setCurrent(next),
      rollback: () => setCurrent(before),
      success: next ? `Assigned to ${nextName}` : "Owner cleared",
    });
    setBusy(false);
    if (r.ok) router.refresh();
  }

  const menu = canEdit ? (
    <MoreActionsMenu
      label={`Change owner (now ${shown})`}
      triggerText={variant === "compact" ? undefined : "Change"}
      dots="horizontal"
      size="sm"
      align={variant === "compact" ? "right" : "left"}
      disabled={busy}
      items={ownerOptions(members, meId).map((o) => ({
        label: o.label,
        checked: (o.value || null) === current,
        onSelect: () => void choose(o.value || null),
      }))}
    />
  ) : null;

  if (variant === "compact") {
    return (
      <span className="inline-flex items-center gap-1 min-w-0">
        <span className="text-xs text-ink-3 truncate" title={`Owner: ${shown}`}>
          <span className="sr-only">Owner: </span>
          {name ? name : <span className="italic">Unassigned</span>}
        </span>
        {menu}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-hairline bg-surface text-[13px] text-ink-1">
        <span className="text-ink-3">Owner</span>
        <span className={name ? "font-semibold" : "text-ink-3"}>{shown}</span>
      </span>
      {menu}
    </span>
  );
}
