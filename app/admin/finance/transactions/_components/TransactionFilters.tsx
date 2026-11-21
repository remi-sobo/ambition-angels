"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FinCategory } from "@/lib/finance/types";
import FilterRow from "@/app/admin/_components/ui/FilterRow";
import { Select } from "@/app/admin/_components/ui/Input";
import Input from "@/app/admin/_components/ui/Input";
import CategoryOptions from "../../_components/CategoryOptions";
import { TX_BASE, txFilterHref, type TxFilters } from "@/lib/finance/transactionsList";

// The Transactions filter row (V4 Stage G2, the kit FilterRow). The URL is
// the state: search, category, status and the date range write q, category,
// status, from and to; any change returns to the first page. Search and dates
// are held locally and pushed after a short pause so typing never snaps back.
export default function TransactionFilters({
  categories,
  filters,
  disabled = false,
}: {
  categories: FinCategory[];
  filters: TxFilters;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setQ(filters.q), [filters.q]);
  useEffect(() => setFrom(filters.from), [filters.from]);
  useEffect(() => setTo(filters.to), [filters.to]);

  const go = (patch: Partial<TxFilters>) => {
    router.replace(txFilterHref({ ...filters, q, from, to, ...patch }), { scroll: false });
  };
  const later = (patch: Partial<TxFilters>, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go(patch), ms);
  };

  const status = (key: TxFilters["status"], label: string) => ({
    key,
    label,
    active: filters.status === key,
    onClick: () => go({ status: filters.status === key ? "" : key }),
  });

  return (
    <FilterRow
      disabled={disabled}
      disabledNote={disabled ? "Filters turn on once there are transactions." : undefined}
      search={{
        value: q,
        onChange: (v) => {
          setQ(v);
          later({ q: v }, 300);
        },
        label: "Search transactions",
        placeholder: "Search descriptions",
      }}
      quickFilters={[
        {
          key: "uncategorized",
          label: "Uncategorized",
          active: filters.category === "uncategorized",
          onClick: () => go({ category: filters.category === "uncategorized" ? "" : "uncategorized" }),
        },
        status("inflow", "Money in"),
        status("outflow", "Money out"),
        status("restricted", "Restricted"),
      ]}
      onClearAll={() => {
        setQ("");
        setFrom("");
        setTo("");
        router.replace(TX_BASE, { scroll: false });
      }}
      right={
        disabled ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Category"
              value={filters.category === "uncategorized" ? "" : filters.category}
              onChange={(e) => go({ category: e.target.value })}
              className="max-w-[220px] text-sm"
            >
              <option value="">Any category</option>
              <CategoryOptions categories={categories} />
            </Select>
            <Input
              type="date"
              aria-label="From date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                later({ from: e.target.value }, 400);
              }}
              className="w-[150px] text-sm"
            />
            <Input
              type="date"
              aria-label="To date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                later({ to: e.target.value }, 400);
              }}
              className="w-[150px] text-sm"
            />
          </div>
        )
      }
    />
  );
}
