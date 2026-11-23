"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import FilterRow from "@/app/admin/_components/ui/FilterRow";

/**
 * The roster's filter row (V4 Stage E). The URL is the state: search and the
 * cohort filter write `q` and `cohort` and keep the view; paging resets.
 * `disabled` is the first-run form (SetupEmpty.dc.html): the row shows but
 * is off until there is someone to filter.
 */
export default function RosterFilterRow({
  q,
  cohort,
  view,
  cohorts,
  disabled = false,
  disabledNote,
}: {
  q: string;
  cohort: string | null;
  view: string;
  cohorts: { id: string; name: string }[];
  disabled?: boolean;
  disabledNote?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setText(q), [q]);

  const go = (next: { q?: string; cohort?: string | null }) => {
    const p = new URLSearchParams();
    if (view !== "all") p.set("view", view);
    const nq = next.q ?? text;
    if (nq.trim()) p.set("q", nq.trim());
    const nc = next.cohort === undefined ? cohort : next.cohort;
    if (nc) p.set("cohort", nc);
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const onSearch = (v: string) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: v }), 300);
  };

  return (
    <FilterRow
      disabled={disabled}
      disabledNote={disabledNote}
      search={{ value: text, onChange: onSearch, label: "Search people", placeholder: "Search by name" }}
      onClearAll={() => {
        setText("");
        go({ q: "", cohort: null });
      }}
      quickFilters={
        cohort
          ? [
              {
                key: "cohort",
                label: cohorts.find((c) => c.id === cohort)?.name ?? "One cohort",
                active: true,
                onClick: () => go({ cohort: null }),
              },
            ]
          : []
      }
      right={
        disabled || cohorts.length === 0 ? null : (
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <span>Cohort</span>
            <select
              value={cohort ?? ""}
              onChange={(e) => go({ cohort: e.target.value || null })}
              className="h-10 rounded-control border border-outline bg-surface px-2 text-sm text-ink-1 max-w-[220px]"
            >
              <option value="">Any cohort</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )
      }
    />
  );
}
