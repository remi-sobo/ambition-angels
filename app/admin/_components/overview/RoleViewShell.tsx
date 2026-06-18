"use client";

import { useEffect, useState, type ReactNode } from "react";

// Role-view shell + the pill toggle. The view defaults to the logged-in
// person's own view (CEO for Remi, Ops for Shannon, resolved server-side and
// passed as `defaultView`); the pill peeks at the other. The manual override is
// persisted per-device in localStorage (matching the DataTable precedent) — a
// server-side user_preferences table is the heavier multi-device play, deferred.
//
// Both views are rendered server-side and kept mounted; the toggle only flips a
// `hidden` class, so switching is instant and there is no hydration mismatch
// (initial render matches the server default, the stored override is applied in
// an effect after mount).

export type ViewKey = "ceo" | "ops";

const STORAGE_KEY = "bloomos.overview.view";

const TABS: Array<{ key: ViewKey; label: string }> = [
  { key: "ceo", label: "CEO Cockpit" },
  { key: "ops", label: "Ops Control" },
];

export default function RoleViewShell({
  defaultView,
  ceo,
  ops,
}: {
  defaultView: ViewKey;
  ceo: ReactNode;
  ops: ReactNode;
}) {
  const [active, setActive] = useState<ViewKey>(defaultView);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "ceo" || stored === "ops") setActive(stored);
    } catch {
      /* non-fatal */
    }
  }, []);

  const choose = (key: ViewKey) => {
    setActive(key);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* non-fatal */
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="inline-flex p-1 bg-tile border-[1.5px] border-outline rounded-full">
          {TABS.map((t) => {
            const on = active === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => choose(t.key)}
                aria-pressed={on}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  on ? "bg-orange text-white shadow-tile" : "text-ink-2 hover:text-ink-1"
                }`}
              >
                {t.label}
                {t.key === defaultView && <span className="ml-1.5 opacity-60">· yours</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className={active === "ceo" ? "" : "hidden"}>{ceo}</div>
      <div className={active === "ops" ? "" : "hidden"}>{ops}</div>
    </div>
  );
}
