"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Lens-as-altitude (Phase B2): one dataset, three altitudes. The pill + filter
// bar are URL-synced (not localStorage) so a lens and filter set are shareable
// and bookmarkable. Switching lens / filters only changes the query string; the
// server re-renders the body. The pill mirrors the CEO/Ops role pill so it reads
// as the same gesture. Phase D: the chosen lens is remembered per device, and a
// "due for review" filter surfaces measures gone stale.

export type LensKey = "org" | "area" | "mine";

const LENS_STORAGE = "bloomos.strategy.lens";

const LENSES: { key: LensKey; label: string }[] = [
  { key: "org", label: "Org" },
  { key: "area", label: "Area" },
  { key: "mine", label: "Mine" },
];

const STATUS_OPTS = [
  { value: "all", label: "All statuses" },
  { value: "off_track", label: "Off track" },
  { value: "on_track", label: "On track" },
  { value: "done", label: "Done" },
  { value: "not_started", label: "Not started" },
];

const REVIEW_OPTS = [
  { value: "all", label: "Any freshness" },
  { value: "due", label: "Due for review" },
];

const selectCls =
  "bg-tile border-[1.5px] border-outline rounded-full px-3 py-1.5 text-xs font-semibold text-ink-1 cursor-pointer focus:outline-none focus:border-orange/40";

export default function StrategyControls({
  lens,
  yoursLens,
  areas,
  owners,
  current,
}: {
  lens: LensKey;
  yoursLens: LensKey;
  areas: { id: string; title: string }[];
  owners: { value: string; label: string }[];
  current: { area: string; owner: string; status: string; review: string };
}) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const buildUrl = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(sp?.toString() ?? "");
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "" || v === "all") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const update = (next: Record<string, string | null>) => {
    router.push(buildUrl(next), { scroll: false });
  };

  // Remember the last lens per device. Role decides the first visit; once the
  // user picks a lens we honor it on return (when the URL doesn't pin one).
  useEffect(() => {
    if (sp?.has("lens")) return;
    try {
      const stored = localStorage.getItem(LENS_STORAGE);
      if ((stored === "area" || stored === "mine") && stored !== lens) {
        router.replace(buildUrl({ lens: stored }), { scroll: false });
      }
    } catch {
      /* non-fatal */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseLens = (key: LensKey) => {
    try {
      localStorage.setItem(LENS_STORAGE, key);
    } catch {
      /* non-fatal */
    }
    update({ lens: key === "org" ? null : key });
  };

  const showFilters = lens !== "org";

  return (
    <div className="space-y-3 mb-6">
      <div className="inline-flex p-1 bg-tile border-[1.5px] border-outline rounded-full">
        {LENSES.map((l) => {
          const on = lens === l.key;
          return (
            <button
              key={l.key}
              type="button"
              onClick={() => chooseLens(l.key)}
              aria-pressed={on}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                on ? "bg-orange text-white shadow-tile" : "text-ink-2 hover:text-ink-1"
              }`}
            >
              {l.label}
              {l.key === yoursLens && <span className="ml-1.5 opacity-60">· yours</span>}
            </button>
          );
        })}
      </div>

      {showFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={current.area}
            onChange={(e) => update({ area: e.target.value })}
            className={selectCls}
            aria-label="Filter by area"
          >
            <option value="all">All areas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>

          {lens === "area" && (
            <select
              value={current.owner}
              onChange={(e) => update({ owner: e.target.value })}
              className={selectCls}
              aria-label="Filter by owner"
            >
              <option value="all">All owners</option>
              {owners.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}

          <select
            value={current.status}
            onChange={(e) => update({ status: e.target.value })}
            className={selectCls}
            aria-label="Filter by status"
          >
            {STATUS_OPTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <select
            value={current.review}
            onChange={(e) => update({ review: e.target.value })}
            className={selectCls}
            aria-label="Filter by review freshness"
          >
            {REVIEW_OPTS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          {lens === "mine" && (
            <span className="text-[11px] text-ink-2">Showing what you own</span>
          )}
        </div>
      )}
    </div>
  );
}
