"use client";

// Funder typeahead. Searches existing constituents (organizations first) and
// lets you either pick one or type a new name (find-or-created on the server).
// Picking a result over free-texting is what keeps us from spawning duplicate
// funder records — the whole reason grants/asks moved off a bare text input.
//
// Emits { funderId, funderName }: funderId is set only when an existing funder
// was picked; typing anything after a pick clears it so the text is treated as
// a new funder. Parents submit funder_id when present, else funder_name.

import { useEffect, useRef, useState } from "react";

export type FunderChoice = { funderId: string | null; funderName: string };

type Result = { id: string; type: string; name: string };

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

export default function FunderPicker({
  value,
  onChange,
  placeholder = "Search funders…",
  className = "",
  autoFocus = false,
}: {
  value: FunderChoice;
  onChange: (next: FunderChoice) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const query = value.funderName;

  // Debounced search; skip while an existing funder is selected (the input
  // shows its name and we don't want to re-open the menu on every keystroke).
  useEffect(() => {
    if (value.funderId) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/funders/search?q=${encodeURIComponent(q)}`);
        const j = await res.json().catch(() => ({}));
        if (!cancelled) {
          setResults(Array.isArray(j.results) ? j.results : []);
          setOpen(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, value.funderId]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (r: Result) => {
    onChange({ funderId: r.id, funderName: r.name });
    setOpen(false);
  };

  const typed = query.trim();
  const exactMatch = results.some((r) => r.name.toLowerCase() === typed.toLowerCase());

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          // Any edit means "not the picked funder anymore".
          onChange({ funderId: null, funderName: e.target.value });
          setOpen(true);
        }}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        className={inputCls + " w-full"}
      />
      {value.funderId && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-revenue bg-revenue-bg border border-revenue/30 px-1.5 py-0.5 rounded-full">
          linked
        </span>
      )}
      {open && (typed.length >= 2) && (
        <div className="absolute z-20 mt-1 w-full bg-tile border-[1.5px] border-outline rounded-lg shadow-tile max-h-64 overflow-auto">
          {loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-ink-3">Searching…</div>
          )}
          {results.map((r) => (
            <button
              type="button"
              key={r.id}
              onClick={() => pick(r)}
              className="w-full text-left px-3 py-2 hover:bg-orange/10 flex items-center justify-between gap-2"
            >
              <span className="text-sm text-ink-1 truncate">{r.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-ink-3 flex-shrink-0">
                {r.type === "organization" ? "Org" : "Person"}
              </span>
            </button>
          ))}
          {!exactMatch && (
            <button
              type="button"
              onClick={() => {
                onChange({ funderId: null, funderName: typed });
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 border-t border-outline hover:bg-orange/10 text-xs text-orange font-semibold"
            >
              + Create new funder “{typed}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
