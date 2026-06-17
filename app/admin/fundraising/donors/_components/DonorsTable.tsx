"use client";

import Link from "next/link";
import DataTable, { type Column } from "../../../_components/DataTable";

// Client wrapper for the Donors list: defines the column model (cell renderers
// can't cross the server→client boundary, so they live here) and hands plain,
// serializable row data to the shared DataTable.

export type DonorFlag = { label: string; help: string; style: string };

export type DonorRow = {
  id: string;
  name: string;
  email: string | null;
  total: number;
  count: number;
  first: string | null;
  last: string | null;
  recurring: boolean;
  major: boolean;
  doNotContact: boolean;
  flags: DonorFlag[];
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export default function DonorsTable({
  rows,
  totalHeader,
  anon,
}: {
  rows: DonorRow[];
  totalHeader: string;
  anon: { total: number; count: number } | null;
}) {
  const columns: Column<DonorRow>[] = [
    {
      key: "name",
      header: "Donor",
      alwaysVisible: true,
      value: (r) => r.name,
      cell: (r) => (
        <Link href={`/admin/fundraising/donors/${r.id}`} className="flex items-center gap-3 group">
          <span className="w-8 h-8 rounded-full bg-orange/10 border border-orange/20 flex items-center justify-center flex-shrink-0 text-orange font-bold text-xs">
            {r.name[0]?.toUpperCase()}
          </span>
          <span className="font-medium text-ink-1 group-hover:text-orange transition-colors">{r.name}</span>
          {r.recurring && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange/20 text-orange">Monthly</span>
          )}
          {r.major && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-revenue/15 text-revenue">Major</span>
          )}
          {r.doNotContact && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-expense-bg text-expense">Do not contact</span>
          )}
          {r.flags.map((f) => (
            <span key={f.label} title={f.help} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${f.style}`}>
              {f.label}
            </span>
          ))}
        </Link>
      ),
    },
    { key: "email", header: "Email", value: (r) => r.email, cell: (r) => <span className="text-ink-2 text-xs">{r.email ?? "—"}</span> },
    { key: "total", header: totalHeader, align: "right", value: (r) => r.total, cell: (r) => <span className="font-bold text-ink-1 [font-variant-numeric:tabular-nums]">{money(r.total)}</span> },
    { key: "count", header: "Gifts", align: "right", value: (r) => r.count },
    { key: "first", header: "First Gift", value: (r) => r.first, cell: (r) => <span className="text-ink-2 text-xs whitespace-nowrap">{fmtDate(r.first)}</span> },
    { key: "last", header: "Latest Gift", value: (r) => r.last, cell: (r) => <span className="text-ink-2 text-xs whitespace-nowrap">{fmtDate(r.last)}</span> },
    {
      key: "profile",
      header: "",
      sortable: false,
      value: () => null,
      cell: (r) => (
        <Link href={`/admin/fundraising/donors/${r.id}`} className="text-xs font-semibold text-orange hover:text-orange-mid">
          Profile →
        </Link>
      ),
    },
  ];

  return (
    <DataTable<DonorRow>
      rows={rows}
      columns={columns}
      getRowKey={(r) => r.id}
      initialSort={{ key: "total", dir: "desc" }}
      pageSize={25}
      csvFilename="donors.csv"
      storageKey="donors-table-cols"
      emptyMessage="No donors match this filter. Try a different year or segment."
      caption={
        anon ? (
          <span className="italic">
            Anonymous / no identity — {money(anon.total)} across {anon.count} gift{anon.count === 1 ? "" : "s"}
          </span>
        ) : undefined
      }
    />
  );
}
