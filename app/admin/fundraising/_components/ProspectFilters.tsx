"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * URL-driven filter bar. State lives in the URL search params so a
 * filtered view is shareable / bookmarkable. We mirror the values into
 * local state for typing responsiveness, then commit to the URL.
 */
export default function ProspectFilters({
  q,
  lifecycle,
  owner,
  scored,
  lifecycleOptions,
  ownerOptions,
}: {
  q: string;
  lifecycle: string;
  owner: string;
  scored: boolean;
  lifecycleOptions: string[];
  ownerOptions: string[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [localQ, setLocalQ] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local search input in sync when the URL changes externally
  // (e.g. user clicks Prev/Next and the q in the URL is unchanged).
  useEffect(() => {
    setLocalQ(q);
  }, [q]);

  function pushParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams();
    const current: Record<string, string> = {};
    if (q) current.q = q;
    if (lifecycle) current.lifecycle = lifecycle;
    if (owner) current.owner = owner;
    if (scored) current.scored = "1";
    const merged = { ...current, ...updates };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== null && v !== "") params.set(k, v);
    }
    // Any filter change resets pagination + sort to defaults.
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/admin/fundraising?${qs}` : "/admin/fundraising");
    });
  }

  function onSearchChange(value: string) {
    setLocalQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams({ q: value || null });
    }, 250);
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
      <input
        type="search"
        value={localQ}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search name or email…"
        className="flex-1 min-w-[200px] bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50"
      />

      <select
        value={lifecycle}
        onChange={(e) => pushParams({ lifecycle: e.target.value || null })}
        className="bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
      >
        <option value="">All lifecycles</option>
        {lifecycleOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>

      <select
        value={owner}
        onChange={(e) => pushParams({ owner: e.target.value || null })}
        className="bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 font-mono text-xs focus:outline-none focus:border-orange/50"
      >
        <option value="">All owners</option>
        {ownerOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 cursor-pointer select-none text-ink-1">
        <input
          type="checkbox"
          checked={scored}
          onChange={(e) => pushParams({ scored: e.target.checked ? "1" : null })}
          className="accent-orange"
        />
        Scored only
      </label>
    </div>
  );
}
