import DataTable, { DataTableSkeleton, type DataTableColumn } from "../../_components/ui/DataTable";
import { TYPE } from "@/lib/admin/typeScale";
import { filterParams, parseTableState, type TableSpec } from "@/lib/admin/dataTable";

// /admin/kit: DataTable v2 with made-up rows, sorted and paged on the
// "server" (here, this component) from the URL, with bulk selection on.

type Row = { id: string; name: string; kind: string; lifetime: number; last: string; next: string | null };

const NAMES = ["Harbor Fund", "Example Family", "Sample Co-op", "Placeholder Trust", "Demo Foundation"];

const ROWS: Row[] = Array.from({ length: 23 }, (_, i) => ({
  id: `kit-${i + 1}`,
  name: `${NAMES[i % 5]} ${i + 1}`,
  kind: i % 3 === 0 ? "Organization" : "Person",
  lifetime: ((i * 7919) % 50) * 500,
  last: `2026-${String((i % 11) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
  next: i % 4 === 0 ? null : "Send the year-end note",
}));

const SPEC: TableSpec = {
  sortable: [
    { key: "lifetime", first: "desc" },
    { key: "last", first: "desc" },
  ],
  defaultSort: { key: "lifetime", dir: "desc" },
  pageSize: 8,
};

export default function KitDataTable({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const state = parseTableState(searchParams, SPEC);
  const k = state.sort?.key === "last" ? "last" : "lifetime";
  const d = state.sort?.dir === "asc" ? 1 : -1;
  const sorted = [...ROWS].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : a.id.localeCompare(b.id)) * d);
  const page = sorted.slice(state.page * SPEC.pageSize, (state.page + 1) * SPEC.pageSize);
  const columns: DataTableColumn<Row>[] = [
    { key: "name", header: "Donor", render: (r) => <span className="font-semibold text-ink-1">{r.name}</span> },
    { key: "kind", header: "Type", className: "text-ink-2", render: (r) => r.kind },
    {
      key: "lifetime",
      header: "Lifetime",
      align: "right",
      className: "tabular-nums",
      render: (r) => `$${r.lifetime.toLocaleString("en-US")}`,
    },
    { key: "last", header: "Last gift", className: "text-ink-2 tabular-nums", render: (r) => r.last },
  ];
  return (
    <section id="datatable" aria-labelledby="datatable-h" className="mt-12 scroll-mt-24">
      <h2 id="datatable-h" className={TYPE.sectionTitle}>
        DataTable v2
      </h2>
      <p className={`${TYPE.bodyMuted} mt-1 mb-4 max-w-reading`}>
        Sort and page live in the URL and run on the server. Select rows to see the bulk footer. Under 640px the rows
        become cards. Below it, the loading skeleton.
      </p>
      <DataTable
        label="Sample donors"
        noun={{ one: "donor", many: "donors" }}
        columns={columns}
        nextStep={{ header: "Next step", render: (r) => r.next ?? <span className="text-ink-3">—</span> }}
        data={{ rows: page, total: ROWS.length, page: state.page, pageSize: SPEC.pageSize }}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.name}
        spec={SPEC}
        state={state}
        baseHref="/admin/kit"
        filters={filterParams(searchParams, ["drawer", "selected"])}
        bulkActions={[{ kind: "link", key: "show", label: "Show selected ids", href: "/admin/kit#datatable", param: "selected" }]}
      />
      {searchParams.selected ? <p className={`${TYPE.metadata} mt-2`}>Bulk action received: {searchParams.selected}</p> : null}
      <div className="mt-4">
        <DataTableSkeleton rows={3} columns={5} />
      </div>
    </section>
  );
}
