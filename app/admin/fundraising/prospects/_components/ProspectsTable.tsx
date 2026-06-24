"use client";

// Prospects list on the shared DataTable (design-system §4.4). The server
// component loads every HubSpot-mirror contact (read-only staging) joined to
// its internal score and passes plain rows here. This wrapper owns the
// lifecycle / owner / scored facets (faceted filters aren't part of the
// generic table), then hands the faceted rows to DataTable for search, sort,
// column picker, pagination, CSV, bulk actions, and saved views.

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { type Column, type BulkAction } from "../../../_components/DataTable";
import { CategoryTag, ScoreBadge } from "@/app/admin/_components/StatusChip";
import AddProspectModal from "./AddProspectModal";

export type ProspectRow = {
  id: string;
  hubspot_id: string | null;
  source: string;
  type: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  name: string;
  company: string | null;
  lifecycle_stage: string | null;
  owner_id: string | null;
  last_activity_at: string | null;
  score_total: number | null;
};

const selectCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm focus:outline-none focus:border-orange/50";

function displayName(r: ProspectRow): string {
  return r.name || r.email || "Unknown";
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

export default function ProspectsTable({
  rows,
  lifecycleOptions,
  ownerOptions,
  disqualifiedView = false,
}: {
  rows: ProspectRow[];
  lifecycleOptions: string[];
  ownerOptions: string[];
  disqualifiedView?: boolean;
}) {
  const router = useRouter();
  const [lifecycle, setLifecycle] = useState("");
  const [owner, setOwner] = useState("");
  const [scored, setScored] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!lifecycle || r.lifecycle_stage === lifecycle) &&
          (!owner || r.owner_id === owner) &&
          (!scored || r.score_total !== null)
      ),
    [rows, lifecycle, owner, scored]
  );

  const columns: Column<ProspectRow>[] = [
    {
      key: "name",
      header: "Name",
      value: (r) => displayName(r),
      render: (r) => (
        <span className="flex items-center gap-1.5">
          {r.hubspot_id ? (
            <Link
              href={`/admin/fundraising/prospects/${encodeURIComponent(r.hubspot_id)}`}
              className="text-ink-1 font-medium hover:text-orange"
            >
              {displayName(r)}
            </Link>
          ) : (
            <span className="text-ink-1 font-medium">{displayName(r)}</span>
          )}
          {r.type && r.type !== "individual" && (
            <span className="text-[9px] uppercase tracking-wide text-ink-3 border border-outline rounded px-1 py-px">
              {r.type === "foundation" ? "Foundation" : r.type === "corporate" ? "Corp" : r.type}
            </span>
          )}
          {r.source === "manual" && <span className="text-[9px] uppercase tracking-wide text-orange/80">added</span>}
          {r.source === "research" && <span className="text-[9px] uppercase tracking-wide text-revenue">AI</span>}
        </span>
      ),
    },
    {
      key: "email",
      header: "Email",
      value: (r) => r.email ?? "",
      render: (r) => <span className="text-ink-2 truncate block max-w-[220px]">{r.email ?? "—"}</span>,
    },
    {
      key: "company",
      header: "Company",
      value: (r) => r.company ?? "",
      render: (r) => <span className="text-ink-2 truncate block max-w-[160px]">{r.company ?? "—"}</span>,
    },
    {
      key: "lifecycle",
      header: "Lifecycle",
      value: (r) => r.lifecycle_stage ?? "",
      render: (r) =>
        r.lifecycle_stage ? (
          <CategoryTag category={r.lifecycle_stage}>{r.lifecycle_stage}</CategoryTag>
        ) : (
          <span className="text-ink-2">—</span>
        ),
    },
    {
      key: "owner_id",
      header: "Owner ID",
      value: (r) => r.owner_id ?? "",
      render: (r) => <span className="text-ink-2 font-mono text-xs">{r.owner_id ?? "—"}</span>,
      defaultHidden: true,
    },
    {
      key: "last_activity",
      header: "Last Activity",
      value: (r) => r.last_activity_at,
      render: (r) => <span className="text-ink-2">{fmtRelative(r.last_activity_at)}</span>,
    },
    {
      key: "score",
      header: "Score",
      align: "right",
      value: (r) => r.score_total,
      render: (r) => <ScoreBadge score={r.score_total} />,
    },
  ];

  const bulkActions: BulkAction<ProspectRow>[] = [
    {
      label: "Copy emails",
      run: (selected) => {
        const emails = selected.map((r) => r.email).filter((e): e is string => !!e);
        if (emails.length === 0) {
          alert("None of the selected prospects have an email on file.");
          return;
        }
        void navigator.clipboard
          .writeText(emails.join(", "))
          .then(() => alert(`Copied ${emails.length} email${emails.length === 1 ? "" : "s"} to the clipboard.`))
          .catch(() => alert("Could not access the clipboard."));
      },
    },
    // Promote: open an Identify-stage opportunity for each and move them off the
    // bench into the pipeline. Only offered on the active list.
    ...(disqualifiedView
      ? []
      : [
          {
            label: "Promote to pipeline →",
            run: (selected: ProspectRow[]) => {
              if (
                !confirm(
                  `Promote ${selected.length} prospect${selected.length === 1 ? "" : "s"} into the pipeline at the Identify stage? ` +
                    `They'll move off the bench and appear in Pipeline.`
                )
              )
                return;
              void fetch("/api/admin/fundraising/prospects/promote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prospect_ids: selected.map((r) => r.id) }),
              })
                .then((r) => r.json())
                .then((d: { promoted?: number }) => {
                  if (typeof d?.promoted === "number" && d.promoted < selected.length) {
                    alert(`Promoted ${d.promoted} of ${selected.length}. Some may already be in the pipeline.`);
                  }
                  router.refresh();
                })
                .catch(() => alert("Could not promote — try again."));
            },
          } as BulkAction<ProspectRow>,
        ]),
    disqualifiedView
      ? {
          label: "Requalify",
          run: (selected) => {
            void fetch("/api/admin/fundraising/prospects/disqualify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prospect_ids: selected.map((r) => r.id), disqualified: false }),
            }).then(() => router.refresh());
          },
        }
      : {
          label: "Disqualify",
          run: (selected) => {
            if (!confirm(`Remove ${selected.length} prospect(s) from the bench? You can requalify them later.`)) return;
            void fetch("/api/admin/fundraising/prospects/disqualify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prospect_ids: selected.map((r) => r.id), disqualified: true }),
            }).then(() => router.refresh());
          },
        },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value)} className={selectCls}>
          <option value="">All lifecycles</option>
          {lifecycleOptions.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className={`${selectCls} font-mono text-xs`}>
          <option value="">All owners</option>
          {ownerOptions.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 cursor-pointer select-none text-ink-1">
          <input type="checkbox" checked={scored} onChange={(e) => setScored(e.target.checked)} className="accent-orange" />
          Scored only
        </label>
        {!disqualifiedView && (
          <button
            onClick={() => setAddOpen(true)}
            className="ml-auto text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors"
          >
            + Add prospect
          </button>
        )}
      </div>

      <DataTable
        rows={filtered}
        columns={columns}
        getRowId={(r) => r.id}
        initialSort={{ key: "last_activity", dir: "desc" }}
        bulkActions={bulkActions}
        csvFilename="prospects.csv"
        viewsKey="prospects"
        searchPlaceholder="Search prospects by name, email, or company…"
        emptyMessage="No prospects on the bench match these filters."
      />

      {addOpen && <AddProspectModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}
