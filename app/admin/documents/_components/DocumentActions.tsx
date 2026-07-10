"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Per-row actions for the documents hub. Archive is reversible; delete is
// permanent (row + links + storage object via the API) and confirms first.
export default function DocumentActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    await fetch(`/api/admin/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
  };

  const remove = async () => {
    if (!window.confirm("Delete this document everywhere? The file and all its record links are removed.")) return;
    setBusy(true);
    await fetch(`/api/admin/documents/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  };

  const btn =
    "text-[11px] font-semibold px-2 py-0.5 rounded-full border border-outline text-ink-2 hover:text-ink-1 transition-colors disabled:opacity-50 whitespace-nowrap";

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => patch({ status: status === "archived" ? "active" : "archived" })}
        className={btn}
      >
        {status === "archived" ? "Unarchive" : "Archive"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={remove}
        className={`${btn} hover:text-expense hover:border-expense/40`}
      >
        Delete
      </button>
    </span>
  );
}
