"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type DeletedChart = { id: string; title: string; deleted_at: string };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

// The recoverable archive for soft-deleted OGSM charts (plan_objectives with
// deleted_at set). Lives in the review page header. The count badge comes from
// the server render; the panel re-fetches the list when opened so it's live
// even when the page render has gone stale. Restore clears deleted_at and the
// chart reappears in its old position (sort_order is preserved).
export default function DeletedCharts({ deleted }: { deleted: DeletedChart[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<DeletedChart[]>(deleted);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const openPanel = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/plan/objectives/deleted");
      if (res.ok) {
        const j = await res.json().catch(() => null);
        if (j?.deleted) setList(j.deleted as DeletedChart[]);
      }
    } finally {
      setLoading(false);
    }
  };

  const restore = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/plan/objectives/${id}/restore`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setList((l) => l.filter((d) => d.id !== id));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <button
        onClick={() => void openPanel()}
        title="View and restore deleted charts"
        className="text-xs font-semibold text-ink-1 bg-tile hover:bg-[#EFE6D4] px-4 py-2 rounded-full transition-colors"
      >
        Deleted charts{deleted.length > 0 ? ` (${deleted.length})` : ""}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Deleted charts"
        >
          <div
            className="bg-tile border-[1.5px] border-outline rounded-card-lg p-5 w-full max-w-lg mt-12 shadow-tile"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-heading font-bold text-ink-1 text-sm flex-1">Deleted charts</h2>
              <button onClick={() => setOpen(false)} className="text-ink-3 hover:text-ink-1 text-sm px-1" aria-label="Close">
                ✕
              </button>
            </div>
            {loading ? (
              <p className="text-sm text-ink-2">Loading…</p>
            ) : list.length === 0 ? (
              <p className="text-sm text-ink-2">
                Nothing here — charts you delete land in this archive and can be restored any time.
              </p>
            ) : (
              <ul className="space-y-2">
                {list.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-2 bg-surface border-[1.5px] border-outline rounded-card px-3 py-2"
                  >
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-sm font-semibold text-ink-1">{d.title}</p>
                      <p className="text-[11px] text-ink-3">deleted {fmtDate(d.deleted_at)}</p>
                    </div>
                    <button
                      onClick={() => void restore(d.id)}
                      disabled={busyId !== null}
                      className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-1.5 rounded-full transition-colors disabled:opacity-50"
                    >
                      {busyId === d.id ? "Restoring…" : "Restore"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
