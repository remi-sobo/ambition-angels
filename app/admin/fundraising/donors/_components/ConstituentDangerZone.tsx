"use client";

// Archive / delete controls for a Constituent 360 (consultant model). Archive
// is always available and reversible. Hard delete is offered only when the
// donor has no gifts/grants; otherwise it's disabled in favour of Archive or
// Merge, because deleting a donor with giving would orphan their gifts.

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ConstituentDangerZone({
  id,
  name,
  archived,
  hasGifts,
}: {
  id: string;
  name: string;
  archived: boolean;
  hasGifts: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "archive" | "delete">(null);

  const toggleArchive = async () => {
    setBusy("archive");
    try {
      const r = await fetch(`/api/admin/constituents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !archived }),
      });
      if (!r.ok) throw new Error();
      router.refresh();
    } catch {
      alert("Could not update — try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete ${name}? This permanently removes the record and their non-gift history. This cannot be undone.`)) return;
    setBusy("delete");
    try {
      const r = await fetch(`/api/admin/constituents/${id}`, { method: "DELETE" });
      if (r.status === 409) {
        alert("This donor has financial history. Archive or merge them instead of deleting.");
        return;
      }
      if (!r.ok) throw new Error();
      router.push("/admin/fundraising/donors");
    } catch {
      alert("Could not delete — try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border-t border-outline pt-3 flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={toggleArchive}
        disabled={busy !== null}
        className="text-[11px] font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-3 py-1.5 rounded-full transition-colors disabled:opacity-60"
      >
        {busy === "archive" ? "…" : archived ? "Unarchive" : "Archive"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={busy !== null || hasGifts}
        title={hasGifts ? "Has gifts — archive or merge instead of deleting" : "Permanently delete this record"}
        className="text-[11px] font-semibold px-3 py-1.5 rounded-full border-[1.5px] transition-colors disabled:opacity-40 text-expense border-expense/30 bg-expense-bg hover:bg-expense/10"
      >
        {busy === "delete" ? "…" : "Delete"}
      </button>
      {hasGifts && <span className="text-[10px] text-ink-3">Delete is disabled — donor has giving history.</span>}
    </div>
  );
}
