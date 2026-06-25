"use client";

// Epic D1 — create and manage a donor's household from their profile.
// Membership is constituents.household_id; the household record itself is
// owned by /api/admin/households. No-household mode creates (name + salutation
// + a member typeahead) or joins an existing one; in-household mode adds and
// removes members, and renames / sets the salutation inline. Every action
// router.refresh()es the server profile.

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

type Member = { id: string; name: string; total: string };
type Household = { id: string; name: string; salutation: string | null; total: string; members: Member[] };

type SearchResult = {
  kind: "constituent" | "prospect";
  id: string | null;
  name: string;
};

/** Debounced constituent typeahead. Only real constituents (not HubSpot
 * mirror prospects) can join a household, and never anyone already excluded. */
function MemberPicker({
  excludeIds,
  placeholder,
  onPick,
  disabled,
}: {
  excludeIds: string[];
  placeholder: string;
  onPick: (id: string, name: string) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string }>>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/constituents/search?q=${encodeURIComponent(value.trim())}`);
        if (!r.ok) return;
        const d = (await r.json()) as { results: SearchResult[] };
        setResults(
          d.results
            .filter((x): x is SearchResult & { id: string } => x.kind === "constituent" && !!x.id)
            .map((x) => ({ id: x.id, name: x.name }))
        );
      } catch {
        /* ignore */
      }
    }, 250);
  }, []);

  // Exclude self/current/staged members at render time so the list stays
  // current as people are added (the debounced fetch is memoized and would
  // otherwise capture a stale exclude set).
  const exclude = new Set(excludeIds);
  const shown = results.filter((r) => !exclude.has(r.id));

  return (
    <div className="relative">
      <input
        value={q}
        disabled={disabled}
        onChange={(e) => search(e.target.value)}
        placeholder={placeholder}
        className={inputCls + " text-xs w-52 disabled:opacity-50"}
      />
      {shown.length > 0 && (
        <ul className="absolute z-20 mt-1 w-60 max-h-56 overflow-auto bg-tile border-[1.5px] border-outline rounded-lg shadow-tile">
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(r.id, r.name);
                  setQ("");
                  setResults([]);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-ink-1 hover:bg-orange/10 hover:text-orange transition-colors"
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HouseholdControls({
  constituentId,
  household,
  households,
}: {
  constituentId: string;
  household: Household | null;
  households: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // No-household create form state.
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [salutation, setSalutation] = useState("");
  const [staged, setStaged] = useState<Array<{ id: string; name: string }>>([]);

  // In-household rename/salutation editor state.
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(household?.name ?? "");
  const [editSalutation, setEditSalutation] = useState(household?.salutation ?? "");

  const fail = (err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
    setBusy(false);
  };

  // Join/leave still ride the constituent PATCH: a uuid joins, null leaves.
  const setHousehold = async (householdId: string | null) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/constituents/${constituentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ household_id: householdId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      fail(err, "Failed");
    }
  };

  const createHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/households", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          salutation: salutation.trim() || undefined,
          // The current donor plus everyone staged in the picker.
          member_ids: [constituentId, ...staged.map((s) => s.id)],
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setName("");
      setSalutation("");
      setStaged([]);
      setCreating(false);
      router.refresh();
    } catch (err) {
      fail(err, "Failed to create household");
    }
  };

  // In-household membership + rename, via PATCH /api/admin/households/[id].
  const patchHousehold = async (payload: Record<string, unknown>) => {
    if (!household) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/households/${household.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setEditing(false);
      router.refresh();
    } catch (err) {
      fail(err, "Failed");
    }
  };

  // ── In-household mode ──
  if (household) {
    const memberIds = household.members.map((m) => m.id);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-ink-2">
            Combined household giving{" "}
            <span className="font-bold text-ink-1 [font-variant-numeric:tabular-nums]">{household.total}</span>
            {` · ${household.members.length} member${household.members.length === 1 ? "" : "s"}`}
            {household.salutation && <span className="text-ink-3"> · “{household.salutation}”</span>}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setEditName(household.name);
                setEditSalutation(household.salutation ?? "");
                setEditing((v) => !v);
                setError("");
              }}
              className="text-[11px] font-semibold text-ink-2 hover:text-orange transition-colors"
            >
              {editing ? "Cancel" : "Rename"}
            </button>
            <button
              disabled={busy}
              onClick={() => setHousehold(null)}
              className="text-[11px] font-semibold text-ink-2 hover:text-expense transition-colors disabled:opacity-50"
            >
              Leave household
            </button>
          </div>
        </div>

        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              patchHousehold({ name: editName, salutation: editSalutation });
            }}
            className="flex items-center gap-2 flex-wrap"
          >
            <input
              autoFocus required value={editName} onChange={(e) => setEditName(e.target.value)}
              placeholder="Household name" className={inputCls + " text-xs w-44"}
            />
            <input
              value={editSalutation} onChange={(e) => setEditSalutation(e.target.value)}
              placeholder="Salutation (e.g. Matt & Lisa)" className={inputCls + " text-xs w-56"}
            />
            <button type="submit" disabled={busy} className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors disabled:opacity-50">
              {busy ? "…" : "Save"}
            </button>
          </form>
        )}

        <ul className="flex flex-wrap items-center gap-2">
          {household.members.map((m) => (
            <li key={m.id} className="flex items-center">
              <Link
                href={`/admin/fundraising/donors/${m.id}`}
                className={`text-[11px] rounded-l-full pl-3 pr-2 py-1 border-[1.5px] border-r-0 border-outline transition-colors ${
                  m.id === constituentId ? "bg-orange/10 text-orange" : "bg-tile text-ink-2 hover:text-orange"
                }`}
              >
                {m.name} · {m.total}
              </Link>
              <button
                disabled={busy}
                onClick={() => patchHousehold({ remove_member_ids: [m.id] })}
                title={`Remove ${m.name} from household`}
                className="text-[11px] rounded-r-full pr-2.5 pl-1 py-1 border-[1.5px] border-l-0 border-outline bg-tile text-ink-3 hover:text-expense transition-colors disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
          <li>
            <MemberPicker
              excludeIds={memberIds}
              placeholder="Add member…"
              disabled={busy}
              onPick={(id) => patchHousehold({ add_member_ids: [id] })}
            />
          </li>
        </ul>
        {error && <span className="text-expense text-[11px]">{error}</span>}
      </div>
    );
  }

  // ── No-household mode: create or join ──
  const stagedIds = staged.map((s) => s.id);
  return (
    <div className="space-y-3">
      {creating ? (
        <form onSubmit={createHousehold} className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              autoFocus required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Household name" className={inputCls + " text-xs w-44"}
            />
            <input
              value={salutation} onChange={(e) => setSalutation(e.target.value)}
              placeholder="Salutation (optional)" className={inputCls + " text-xs w-52"}
            />
            <button type="submit" disabled={busy} className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors disabled:opacity-50">
              {busy ? "…" : "Create"}
            </button>
            <button type="button" onClick={() => { setCreating(false); setStaged([]); setError(""); }} className="text-[11px] font-semibold text-ink-2 hover:text-ink-1 transition-colors">
              Cancel
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-ink-3">Members: this donor</span>
            {staged.map((s) => (
              <span key={s.id} className="flex items-center text-[11px] rounded-full bg-tile border-[1.5px] border-outline text-ink-2">
                <span className="pl-3 pr-1.5 py-1">{s.name}</span>
                <button
                  type="button"
                  onClick={() => setStaged((cur) => cur.filter((x) => x.id !== s.id))}
                  className="pr-2.5 pl-1 py-1 text-ink-3 hover:text-expense transition-colors"
                  title={`Remove ${s.name}`}
                >
                  ×
                </button>
              </span>
            ))}
            <MemberPicker
              excludeIds={[constituentId, ...stagedIds]}
              placeholder="Add another person…"
              onPick={(id, n) => setStaged((cur) => [...cur, { id, name: n }])}
            />
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setCreating(true)}
            className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors"
          >
            + Create household
          </button>
          {households.length > 0 && (
            <select
              disabled={busy}
              defaultValue=""
              onChange={(e) => e.target.value && setHousehold(e.target.value)}
              className={inputCls + " text-xs"}
            >
              <option value="" className="bg-tile shadow-tile">Join existing…</option>
              {households.map((h) => (
                <option key={h.id} value={h.id} className="bg-tile shadow-tile">{h.name}</option>
              ))}
            </select>
          )}
        </div>
      )}
      {error && <span className="text-expense text-[11px]">{error}</span>}
    </div>
  );
}
