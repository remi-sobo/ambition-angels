"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { definitionToParams, type ViewDefinition } from "@/lib/fundraising/views";

// Spec Fundraising F1 — the R11 saved-view strip. A saved view is a named
// filter definition in `segments` (the signed ruling's store); applying one
// is just a link that expands the definition into URL params — no hidden
// state. Create and delete go through the existing /api/admin/segments
// routes, so the V1 export panel and this strip stay one store.

type SavedView = { id: string; name: string; definition: Record<string, string> };

export default function SavedViews({
  savedViews,
  current,
}: {
  savedViews: SavedView[];
  current: ViewDefinition;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFilters = Object.keys(current).length > 0;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, definition: current }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Save failed — try again.");
      return;
    }
    setSaving(false);
    setName("");
    router.refresh();
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/admin/segments/${id}`, { method: "DELETE" }).catch(
      () => null,
    );
    setBusy(false);
    if (res?.ok) router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {savedViews.map((sv) => {
        const params = definitionToParams(sv.definition as ViewDefinition);
        return (
          <span
            key={sv.id}
            className="group inline-flex items-center gap-1 bg-tile border-[1.5px] border-outline rounded-full pl-3 pr-1.5 py-1"
          >
            <a
              href={`/admin/fundraising/donors-funders${params ? `?${params}` : ""}`}
              className="text-[11px] font-semibold text-ink-2 hover:text-orange transition-colors"
            >
              {sv.name}
            </a>
            <button
              type="button"
              onClick={() => remove(sv.id)}
              title={`Delete saved view "${sv.name}"`}
              className="text-[11px] text-ink-3 hover:text-expense px-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ✕
            </button>
          </span>
        );
      })}
      {saving ? (
        <span className="inline-flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setSaving(false);
            }}
            placeholder="Name this view"
            maxLength={120}
            className="text-xs bg-tile border-[1.5px] border-outline rounded-full px-3 py-1 text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange w-44"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !name.trim()}
            className="text-xs font-semibold text-orange hover:text-orange-dark disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setSaving(false)}
            className="text-xs text-ink-3 hover:text-ink-1"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setSaving(true)}
          disabled={!hasFilters}
          title={
            hasFilters
              ? "Save the current filters as a named view"
              : "Set a filter to save a view"
          }
          className="text-[11px] font-semibold text-ink-2 hover:text-orange border-[1.5px] border-dashed border-outline rounded-full px-3 py-1 transition-colors disabled:opacity-40"
        >
          + Save view
        </button>
      )}
      {error && <span className="text-[11px] text-expense">{error}</span>}
    </div>
  );
}
