"use client";

// Epic D1 — attach/detach a donor to a household from their profile.
// Membership is constituents.household_id; the household record is owned by
// /api/admin/households. All actions router.refresh() the server profile.

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

export function HouseholdControls({
  constituentId,
  currentHouseholdId,
  households,
}: {
  constituentId: string;
  currentHouseholdId: string | null;
  households: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

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
      setError(err instanceof Error ? err.message : "Failed");
      setBusy(false);
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
        body: JSON.stringify({ name, member_ids: [constituentId] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setName("");
      setCreating(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create household");
      setBusy(false);
    }
  };

  if (currentHouseholdId) {
    return (
      <div className="flex items-center gap-3">
        <button
          disabled={busy}
          onClick={() => setHousehold(null)}
          className="text-[11px] font-semibold text-ink-2 hover:text-expense transition-colors disabled:opacity-50"
        >
          Leave household
        </button>
        {error && <span className="text-expense text-[11px]">{error}</span>}
      </div>
    );
  }

  const others = households.filter((h) => h.id !== currentHouseholdId);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {creating ? (
        <form onSubmit={createHousehold} className="flex items-center gap-2">
          <input
            autoFocus required value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Household name" className={inputCls + " text-xs w-44"}
          />
          <button type="submit" disabled={busy} className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors disabled:opacity-50">
            {busy ? "…" : "Create"}
          </button>
          <button type="button" onClick={() => { setCreating(false); setError(""); }} className="text-[11px] font-semibold text-ink-2 hover:text-ink-1 transition-colors">
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button
            onClick={() => setCreating(true)}
            className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors"
          >
            + Create household
          </button>
          {others.length > 0 && (
            <select
              disabled={busy}
              defaultValue=""
              onChange={(e) => e.target.value && setHousehold(e.target.value)}
              className={inputCls + " text-xs"}
            >
              <option value="" className="bg-tile shadow-tile">Join existing…</option>
              {others.map((h) => (
                <option key={h.id} value={h.id} className="bg-tile shadow-tile">{h.name}</option>
              ))}
            </select>
          )}
        </>
      )}
      {error && <span className="text-expense text-[11px]">{error}</span>}
    </div>
  );
}
