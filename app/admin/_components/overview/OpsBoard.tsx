"use client";

import { useEffect, useState, type ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

// Phase 4 — light tuning for Shannon's own view: reorder and hide cards, no full
// customizer. Each Ops widget is rendered server-side and passed in as a node;
// this client board only arranges and shows/hides them, persisting the layout
// per-device in localStorage (matching the DataTable / role-toggle precedent).
// The CEO cockpit doesn't use this board, so it's unaffected.

export type OpsWidget = { key: string; label: string; node: ReactNode };

type Layout = { order: string[]; hidden: string[] };

const STORAGE_KEY = "bloomos.overview.ops.layout";

export default function OpsBoard({ widgets }: { widgets: OpsWidget[] }) {
  const defaultOrder = widgets.map((w) => w.key);
  const byKey = new Map(widgets.map((w) => [w.key, w]));

  // Initial state matches the server render (default order, nothing hidden) so
  // hydration is clean; the stored layout is applied in an effect after mount.
  const [order, setOrder] = useState<string[]>(defaultOrder);
  const [hidden, setHidden] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Layout;
      const known = new Set(defaultOrder);
      // Reconcile with the current widget set: keep saved order for widgets that
      // still exist, append any new ones, drop any that were removed.
      const savedOrder = (saved.order ?? []).filter((k) => known.has(k));
      const merged = [...savedOrder, ...defaultOrder.filter((k) => !savedOrder.includes(k))];
      setOrder(merged);
      setHidden((saved.hidden ?? []).filter((k) => known.has(k)));
    } catch {
      /* non-fatal */
    }
    // defaultOrder is derived from props that are stable for this view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (o: string[], h: string[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ order: o, hidden: h }));
    } catch {
      /* non-fatal */
    }
  };

  const move = (key: string, dir: -1 | 1) => {
    const i = order.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    persist(next, hidden);
  };

  const toggleHidden = (key: string) => {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    setHidden(next);
    persist(order, next);
  };

  const reset = () => {
    setOrder(defaultOrder);
    setHidden([]);
    persist(defaultOrder, []);
  };

  const isHidden = (key: string) => hidden.includes(key);
  const visible = order.filter((k) => !isHidden(k));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        {editing && (
          <button
            type="button"
            onClick={reset}
            className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile border-[1.5px] border-outline px-3 py-1.5 rounded-full transition-colors"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-pressed={editing}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border-[1.5px] transition-colors ${
            editing ? "bg-orange text-white border-orange" : "text-ink-2 hover:text-ink-1 bg-tile border-outline"
          }`}
        >
          {editing ? "Done" : "Edit layout"}
        </button>
      </div>

      {editing ? (
        <ul className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg divide-y divide-hairline">
          {order.map((key, i) => {
            const w = byKey.get(key);
            if (!w) return null;
            const off = isHidden(key);
            return (
              <li key={key} className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(key, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${w.label} up`}
                    className="text-ink-2 hover:text-orange disabled:opacity-30 disabled:hover:text-ink-2 leading-none text-xs"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(key, 1)}
                    disabled={i === order.length - 1}
                    aria-label={`Move ${w.label} down`}
                    className="text-ink-2 hover:text-orange disabled:opacity-30 disabled:hover:text-ink-2 leading-none text-xs"
                  >
                    ▼
                  </button>
                </div>
                <span className={`flex-1 text-sm font-medium ${off ? "text-ink-3 line-through" : "text-ink-1"}`}>{w.label}</span>
                <button
                  type="button"
                  onClick={() => toggleHidden(key)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    off ? "bg-tile border-outline text-ink-2 hover:text-ink-1" : "bg-orange/15 border-orange/30 text-orange"
                  }`}
                >
                  {off ? "Hidden" : "Shown"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : visible.length === 0 ? (
        <p className={`${TYPE.bodyMuted}`}>Every card is hidden — use “Edit layout” to bring some back.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {visible.map((key) => (
            <div key={key}>{byKey.get(key)?.node}</div>
          ))}
        </div>
      )}
    </div>
  );
}
