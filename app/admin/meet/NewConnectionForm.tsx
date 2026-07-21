"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SCHEDULING_LABEL,
  SCHEDULING_TASK_CATEGORY,
} from "@/app/admin/ops/_types/ops";
import { useAdminUser } from "@/app/admin/_components/AdminUserContext";

// Search result shape from /api/admin/constituents/search (constituents on the
// spine + HubSpot mirror prospects not yet promoted).
type SearchResult = {
  kind: "constituent" | "prospect";
  id: string | null;
  hubspotId: string | null;
  name: string;
  type: string;
  email: string | null;
};

type Chosen = { id: string; name: string };

const inputCls =
  "w-full text-sm bg-cream border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50 disabled:opacity-60";

/**
 * "+ New connection" — for asks that didn't come over email. Pick the person
 * (existing constituent or quick-create) + a purpose + optional due, and it
 * creates a scheduling task assigned to the filer, tied to that person via
 * the existing ops_tasks entity link. created_by is stamped server-side; the
 * backlog is org-wide, so anyone on the team can pick it up or reassign.
 */
export default function NewConnectionForm() {
  const router = useRouter();
  const me = useAdminUser();
  const [open, setOpen] = useState(false);

  // person picker
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // task fields
  const [purpose, setPurpose] = useState("");
  const [due, setDue] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback((value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/admin/constituents/search?q=${encodeURIComponent(value.trim())}`
        );
        if (!r.ok) return;
        const d = (await r.json()) as { results: SearchResult[] };
        setResults(d.results);
      } catch {
        /* ignore — typeahead is best-effort */
      }
    }, 250);
  }, []);

  // Quick-create a constituent from a free-text name (+ optional email),
  // returning its id. Splits "First Last" on the first space.
  async function quickCreate(name: string, email: string | null): Promise<string> {
    const trimmed = name.trim();
    const sp = trimmed.indexOf(" ");
    const first = sp === -1 ? trimmed : trimmed.slice(0, sp);
    const last = sp === -1 ? "" : trimmed.slice(sp + 1).trim();
    const r = await fetch("/api/admin/constituents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "person",
        first_name: first,
        last_name: last || undefined,
        emails: email ? [email] : undefined,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d?.id) throw new Error(d?.error ?? "Could not create the person");
    return d.id as string;
  }

  async function pick(res: SearchResult) {
    setError(null);
    if (res.kind === "constituent" && res.id) {
      setChosen({ id: res.id, name: res.name });
    } else {
      // A HubSpot-mirror prospect isn't on the spine yet; quick-create it so the
      // connection can link to a real constituent (keyed with its email so a
      // later sync can dedupe).
      setBusy(true);
      try {
        const id = await quickCreate(res.name, res.email);
        setChosen({ id, name: res.name });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add that person");
      } finally {
        setBusy(false);
      }
    }
    setResults([]);
    setQ("");
  }

  async function addNew() {
    setError(null);
    setBusy(true);
    try {
      const id = await quickCreate(q, null);
      setChosen({ id, name: q.trim() });
      setResults([]);
      setQ("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that person");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setChosen(null);
    setPurpose("");
    setDue("");
    setQ("");
    setResults([]);
    setError(null);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen || !purpose.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/ops/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: purpose.trim(),
          category: SCHEDULING_TASK_CATEGORY,
          priority: "medium",
          labels: [SCHEDULING_LABEL],
          assigned_to: me,
          due_date: due || null,
          linked_entity_type: "constituent",
          linked_entity_id: chosen.id,
          linked_label: chosen.name,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`);
      reset();
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the connection");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors"
      >
        + New connection
      </button>
    );
  }

  return (
    <div className="rounded-lg border-[1.5px] border-outline bg-tile p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-1">New connection</h3>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-xs text-ink-2 hover:text-ink-1"
        >
          Cancel
        </button>
      </div>

      {/* Step 1 — person */}
      {chosen ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-sm text-ink-1 bg-cream border border-outline rounded-full px-3 py-1">
            <span className="text-ink-3">♥</span>
            {chosen.name}
          </span>
          <button
            type="button"
            onClick={() => setChosen(null)}
            className="text-[11px] text-ink-2 hover:text-orange"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            value={q}
            onChange={(e) => search(e.target.value)}
            disabled={busy}
            placeholder="Who is the meeting with? Search by name…"
            className={inputCls}
            autoFocus
          />
          {(results.length > 0 || q.trim().length >= 2) && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-tile border-[1.5px] border-outline rounded-lg shadow-lg overflow-hidden">
              {results.map((res) => (
                <button
                  key={res.kind === "prospect" ? `p-${res.hubspotId}` : `c-${res.id}`}
                  type="button"
                  onClick={() => pick(res)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[#EFE6D4] flex items-center justify-between gap-2"
                >
                  <span className="text-ink-1 font-medium truncate">
                    {res.name}
                    {res.kind === "prospect" && (
                      <span className="ml-2 text-[10px] font-semibold text-ink-3 uppercase tracking-wider">
                        prospect · add
                      </span>
                    )}
                  </span>
                  <span className="text-ink-3 text-xs truncate">
                    {res.email ?? res.type}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={addNew}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[#EFE6D4] text-orange font-semibold border-t border-outline"
              >
                + Add “{q.trim()}” as a new person
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2 — purpose + due */}
      {chosen && (
        <form onSubmit={create} className="space-y-3">
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder={`Purpose — e.g. Intro call with ${chosen.name}`}
            className={inputCls}
            autoFocus
          />
          <div className="flex items-end gap-3">
            <label className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold flex flex-col gap-1">
              Due (optional)
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className={inputCls + " w-44"}
              />
            </label>
            <button
              type="submit"
              disabled={busy || !purpose.trim()}
              className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add connection"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-expense text-xs">{error}</p>}
    </div>
  );
}
