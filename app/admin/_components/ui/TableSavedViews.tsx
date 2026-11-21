"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";

/**
 * Saved views stored on the server, for a DataTable v2 page (the R11
 * strip Donors & Funders shipped, moved into the kit). A saved view is a
 * named filter definition; applying one is a link that expands it into URL
 * params, so there is no hidden state and a view link can be shared.
 *
 * Storage is the page's: `endpoint` takes POST { name, definition } and
 * DELETE `${endpoint}/${id}`. Donors & Funders uses /api/admin/segments
 * (the same store the export panel and Comms recipients read). Both writes
 * go through saveAction: no optimistic change, the list re-reads on success,
 * and a failure toasts the userMessage() sentence.
 */
export type ServerSavedView = { id: string; name: string; href: string; active?: boolean };

export default function TableSavedViews({
  views,
  definition,
  endpoint,
  label = "Saved views",
}: {
  views: ServerSavedView[];
  /** The filters on screen now: what "+ Save view" stores. */
  definition: Record<string, string>;
  endpoint: string;
  label?: string;
}) {
  const router = useRouter();
  const save = useSaveAction();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const hasFilters = Object.keys(definition).length > 0;

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const r = await save({
      request: { url: endpoint, method: "POST", body: { name: trimmed, definition } },
      success: `Saved "${trimmed}"`,
    });
    setBusy(false);
    if (!r.ok) return;
    setNaming(false);
    setName("");
    router.refresh();
  }

  async function remove(v: ServerSavedView) {
    if (busy) return;
    setBusy(true);
    const r = await save({
      request: { url: `${endpoint}/${v.id}`, method: "DELETE" },
      success: `Deleted "${v.name}"`,
    });
    setBusy(false);
    if (r.ok) router.refresh();
  }

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {views.map((sv) => (
        <span
          key={sv.id}
          className={`group inline-flex items-center gap-1 border-hairline rounded-full pl-3 pr-1.5 py-1 ${
            sv.active ? "bg-accent-soft" : "bg-tile"
          }`}
        >
          <a
            href={sv.href}
            aria-current={sv.active ? "page" : undefined}
            className={`text-xs font-semibold transition-colors ${
              sv.active ? "text-orange-dark" : "text-ink-2 hover:text-orange"
            }`}
          >
            {sv.name}
          </a>
          <button
            type="button"
            onClick={() => void remove(sv)}
            disabled={busy}
            aria-label={`Delete saved view ${sv.name}`}
            title={`Delete saved view "${sv.name}"`}
            className="text-xs text-ink-3 hover:text-expense px-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </span>
      ))}
      {naming ? (
        <span className="inline-flex items-center gap-2">
          <input
            autoFocus
            value={name}
            aria-label="Name for this view"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
              if (e.key === "Escape") setNaming(false);
            }}
            placeholder="Name this view"
            maxLength={120}
            className="text-xs bg-tile border-hairline rounded-full px-3 py-1 text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange w-44"
          />
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy || !name.trim()}
            className="text-xs font-semibold text-orange hover:text-orange-dark disabled:opacity-50"
          >
            Save
          </button>
          <button type="button" onClick={() => setNaming(false)} className="text-xs text-ink-3 hover:text-ink-1">
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          disabled={!hasFilters}
          title={hasFilters ? "Save the current filters as a named view" : "Set a filter to save a view"}
          className="text-xs font-semibold text-ink-2 hover:text-orange border-dashed border-hairline rounded-full px-3 py-1 transition-colors disabled:opacity-40"
        >
          + Save view
        </button>
      )}
    </div>
  );
}
