"use client";

// The gift row's More menu (⋯) on the donor timeline. Recording and editing a
// gift moved to the one gift drawer at V4 B1 (app/admin/fundraising/
// _components/gift/GiftDrawer.tsx), and Edit stays visible on the row. Delete
// lives in this menu since V4 B2, so it is one deliberate step away and never
// sits next to Edit. Hand-entered gifts only: a synced gift shows Delete
// disabled with the reason, and the route refuses it regardless (409).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import MoreActionsMenu from "@/app/admin/_components/ui/MoreActionsMenu";
import { saveAction } from "@/lib/admin/saveAction";

/** Sources the gift route treats as synced (app/api/admin/gifts/[id]). */
const SYNCED_SOURCES = new Set(["stripe", "givebutter", "hubspot_deal"]);

export function GiftRowActions({
  id,
  amountLabel,
  externalSource,
}: {
  id: string;
  /** "$250", for the menu's accessible name. */
  amountLabel?: string;
  externalSource?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const synced = !!externalSource && SYNCED_SOURCES.has(externalSource);

  async function remove() {
    const ok = await confirm({
      title: "Delete this gift?",
      body: "This removes it from all totals.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    // Money: no optimistic change. The timeline re-reads after the server says yes.
    const r = await saveAction({
      request: { url: `/api/admin/gifts/${id}`, method: "DELETE" },
      success: "Gift deleted",
      toast,
    });
    setBusy(false);
    if (r.ok) router.refresh();
  }

  return (
    <MoreActionsMenu
      label={amountLabel ? `More actions for the ${amountLabel} gift` : "More actions for this gift"}
      size="sm"
      dots="horizontal"
      disabled={busy}
      items={[
        {
          label: busy ? "Deleting" : "Delete gift",
          danger: true,
          disabled: synced || busy,
          hint: synced ? "Synced gifts are voided at the source" : undefined,
          onSelect: () => void remove(),
        },
      ]}
    />
  );
}
