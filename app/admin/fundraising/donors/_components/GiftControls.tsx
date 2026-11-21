"use client";

// The gift row's Delete on the donor timeline. Recording and editing a gift
// moved to the one gift drawer at V4 B1 (app/admin/fundraising/_components/
// gift/GiftDrawer.tsx). Delete stays where it was (hand-entered gifts only;
// the route refuses synced ones); the drawer itself never deletes.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { userMessage } from "@/lib/admin/errors";

export function GiftRowActions({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        const ok = await confirm({
          title: "Delete this gift?",
          body: "This removes it from all totals.",
          confirmLabel: "Delete",
          destructive: true,
        });
        if (!ok) return;
        setBusy(true);
        try {
          const res = await fetch(`/api/admin/gifts/${id}`, { method: "DELETE" });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            toast.error(userMessage(res, j));
            return;
          }
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="text-xs font-semibold text-ink-3 hover:text-expense transition-colors disabled:opacity-50"
    >
      Delete
    </button>
  );
}
