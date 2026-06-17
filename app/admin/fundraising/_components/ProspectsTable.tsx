"use client";

import Link from "next/link";
import { CategoryTag, ScoreBadge } from "@/app/admin/_components/StatusChip";
import DataTable, { type Column } from "../../_components/DataTable";

// Client column model for the Prospects list, rendered through the shared
// DataTable. Server-side filtering (search / lifecycle / owner / scored) stays
// on the page; sort, pagination, CSV, and the column picker live here.

export type ProspectRow = {
  hubspot_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  lifecycle_stage: string | null;
  owner_id: string | null;
  last_activity_at: string | null;
  score_total: number | null;
};

function displayName(r: ProspectRow): string {
  const parts = [r.first_name, r.last_name].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  return parts.length ? parts.join(" ") : r.email ?? "Unknown";
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export default function ProspectsTable({ rows }: { rows: ProspectRow[] }) {
  const columns: Column<ProspectRow>[] = [
    {
      key: "name",
      header: "Name",
      alwaysVisible: true,
      value: (r) => displayName(r),
      cell: (r) => (
        <Link
          href={`/admin/fundraising/prospects/${encodeURIComponent(r.hubspot_id)}`}
          className="text-ink-1 font-medium hover:text-orange block"
        >
          {displayName(r)}
        </Link>
      ),
    },
    {
      key: "email",
      header: "Email",
      value: (r) => r.email,
      cell: (r) => <span className="text-ink-2 truncate max-w-[220px] block">{r.email ?? "—"}</span>,
    },
    {
      key: "company",
      header: "Company",
      value: (r) => r.company,
      cell: (r) => <span className="text-ink-2 truncate max-w-[160px] block">{r.company ?? "—"}</span>,
    },
    {
      key: "lifecycle",
      header: "Lifecycle",
      value: (r) => r.lifecycle_stage,
      cell: (r) =>
        r.lifecycle_stage ? (
          <CategoryTag category={r.lifecycle_stage}>{r.lifecycle_stage}</CategoryTag>
        ) : (
          <span className="text-ink-2">—</span>
        ),
    },
    {
      key: "owner",
      header: "Owner ID",
      value: (r) => r.owner_id,
      cell: (r) => <span className="text-ink-2 font-mono text-xs">{r.owner_id ?? "—"}</span>,
      defaultHidden: true,
    },
    {
      key: "last_activity",
      header: "Last Activity",
      value: (r) => r.last_activity_at,
      cell: (r) => <span className="text-ink-2">{fmtRelative(r.last_activity_at)}</span>,
    },
    {
      key: "score",
      header: "Score",
      align: "right",
      value: (r) => r.score_total,
      cell: (r) => <ScoreBadge score={r.score_total} />,
    },
  ];

  return (
    <DataTable<ProspectRow>
      rows={rows}
      columns={columns}
      getRowKey={(r) => r.hubspot_id}
      initialSort={{ key: "last_activity", dir: "desc" }}
      pageSize={50}
      csvFilename="prospects.csv"
      storageKey="prospects-table-cols"
      emptyMessage="No prospects match your filters."
    />
  );
}
