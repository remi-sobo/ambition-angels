import type { ReactNode } from "react";
import {
  pageHref,
  pageInfo,
  sortHref,
  nextSort,
  type DataTableBulkAction,
  type TablePage,
  type TableSpec,
  type TableState,
} from "@/lib/site/ui/dataTable";
import { TYPE } from "@/lib/site/ui/typeScale";
import Notice from "@/app/site-admin/_ui/ui/Notice";
import { SkeletonGroup, SkeletonTable } from "@/app/site-admin/_ui/ui/Skeleton";
import DataTableFrame, { type FrameColumn, type FrameRow } from "@/app/site-admin/_ui/ui/DataTableFrame";

/**
 * DataTable v2: the one list table (spec §6; built on the Donors & Funders
 * pattern, migrated there first as the worked example).
 *
 * The page owns the data and the URL; the table owns the shape:
 *
 *   const spec = { sortable: [{ key: "lifetime", first: "desc" }], defaultSort: { key: "lifetime", dir: "desc" }, pageSize: 50 };
 *   const state = parseTableState(searchParams, spec);          // lib/admin/dataTable.ts
 *   const data = await loadThings({ filters, page: state.page, pageSize: spec.pageSize, sort: state.sort });
 *   <DataTable
 *     label="Donors and funders" noun={{ one: "donor", many: "donors" }}
 *     columns={[{ key: "name", header: "Name", render: (r) => <Link …/>, card: "title" }, …]}
 *     nextStep={{ header: "Next step", render: (r) => … }}
 *     data={data} getRowId={(r) => r.id} getRowLabel={(r) => r.name}
 *     spec={spec} state={state} baseHref="/admin/…" filters={{ view, q }}
 *     bulkActions={[{ kind: "request", key: "assign", label: "Assign to me", url: "/api/admin/…/bulk" }]}
 *   />
 *
 * What it gives every list, with no client state beyond the selection:
 *  - sort headers as links (?sort=&dir=), keyboard-reachable, aria-sort set;
 *    a click changes the server order and returns to page 1
 *  - paging links (?page=N, 0-based) that carry every filter param
 *  - a next-step column slot, last on desktop and its own block on a card
 *  - bulk selection (checkboxes with row names, select-page, a footer with
 *    the count and the actions); actions are data, run through saveAction
 *  - a card layout under 640px, with a sort row
 *  - states: `error` → danger Notice above the frame; no rows → `empty`
 *    (an EmptyState for a first run, a sentence for a filtered-to-zero
 *    view); <DataTableSkeleton> for loading.tsx or Suspense fallbacks
 *
 * Server-safe: this file has no hooks, so a server page passes render
 * functions and they run on the server. Only rendered nodes cross into
 * DataTableFrame (the client half).
 *
 * Filters and saved views stay the page's: put FilterRow or FilterTabs
 * above the table, and <TableSavedViews> for views stored on the server.
 */

export type DataTableColumn<Row> = {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
  align?: "left" | "right";
  /** Sortable when the key is in spec.sortable. */
  className?: string;
  headerClassName?: string;
  /** Phone card placement. Default: the first column is the title, the rest
   *  are fields. */
  card?: "title" | "field" | "hidden";
};

export type { DataTableBulkAction };

export default function DataTable<Row>({
  label,
  noun,
  columns,
  nextStep,
  data,
  getRowId,
  getRowLabel,
  spec,
  state,
  baseHref,
  filters = {},
  bulkActions = [],
  empty,
  emptyMessage = "Nothing matches this view.",
  minWidth,
}: {
  /** The table's accessible name (caption and region label). */
  label: string;
  /** For the footer ("Showing 1–50 of 150 donors"). */
  noun: { one: string; many: string };
  columns: DataTableColumn<Row>[];
  /** The next-step column (spec §5 "Table with a next-step column"). */
  nextStep?: {
    header: string;
    render: (row: Row) => ReactNode;
    /** The spec.sortable key this column orders by, if any. */
    sortKey?: string;
  };
  data: TablePage<Row>;
  getRowId: (row: Row) => string;
  /** Spoken row name for selection. Defaults to the row id. */
  getRowLabel?: (row: Row) => string;
  spec: TableSpec;
  state: TableState;
  baseHref: string;
  /** The page's filter params, carried through every sort and page link. */
  filters?: Record<string, string>;
  bulkActions?: DataTableBulkAction[];
  /** Replaces the default empty sentence (pass an EmptyState for a first run). */
  empty?: ReactNode;
  emptyMessage?: ReactNode;
  /** Minimum table width before it scrolls sideways (desktop only). */
  minWidth?: number;
}) {
  const sortKeys = new Set(spec.sortable.map((c) => c.key));
  const sortFor = (key: string) =>
    sortKeys.has(key)
      ? {
          href: sortHref(baseHref, filters, state, key, spec),
          active: state.sort?.key === key ? state.sort.dir : null,
          next: nextSort(state, key, spec).dir,
        }
      : undefined;
  const frameColumns: FrameColumn[] = columns.map((c, i) => ({
    key: c.key,
    header: c.header,
    align: c.align ?? "left",
    className: c.className,
    headerClassName: c.headerClassName,
    card: c.card ?? (i === 0 ? "title" : "field"),
    sort: sortFor(c.key),
  }));

  const rows: FrameRow[] = data.rows.map((r) => ({
    id: getRowId(r),
    label: getRowLabel ? getRowLabel(r) : getRowId(r),
    cells: columns.map((c) => c.render(r)),
    next: nextStep ? nextStep.render(r) : undefined,
  }));

  const info = pageInfo(data.page, data.pageSize, data.total, data.rows.length);
  const word = data.total === 1 ? noun.one : noun.many;
  const summary =
    data.rows.length === 0
      ? `${data.total} ${word}`
      : info.pageCount > 1
        ? `Showing ${info.from}–${info.to} of ${data.total} ${word}`
        : `Showing ${data.total} ${word}`;

  const emptyNode = info.pastEnd ? (
    <p className={`p-8 ${TYPE.bodyMuted}`}>
      This page is past the end of the list.{" "}
      <a href={pageHref(baseHref, filters, state, 0, spec)} className="font-semibold text-orange hover:text-orange-dark">
        Back to the first page
      </a>
    </p>
  ) : (
    empty ?? <p className={`p-8 ${TYPE.bodyMuted}`}>{emptyMessage}</p>
  );

  return (
    <div className="space-y-3">
      {data.error ? (
        <Notice tone="danger" title="The list failed to load.">
          Reload to retry. ({data.error})
        </Notice>
      ) : null}
      <DataTableFrame
        label={label}
        columns={frameColumns}
        rows={rows}
        nextColumn={
          nextStep
            ? { header: nextStep.header, sort: nextStep.sortKey ? sortFor(nextStep.sortKey) : undefined }
            : null
        }
        bulkActions={bulkActions}
        empty={emptyNode}
        minWidth={minWidth}
        footer={{
          summary,
          pageLabel: info.pageCount > 1 ? `Page ${data.page + 1} of ${info.pageCount}` : null,
          prevHref: info.hasPrev ? pageHref(baseHref, filters, state, data.page - 1, spec) : null,
          nextHref: info.hasNext ? pageHref(baseHref, filters, state, data.page + 1, spec) : null,
        }}
      />
    </div>
  );
}

/** The loading silhouette of a DataTable, for loading.tsx or Suspense. */
export function DataTableSkeleton({ rows = 8, columns = 5, label = "Loading the list" }: { rows?: number; columns?: number; label?: string }) {
  return (
    <SkeletonGroup label={label}>
      <SkeletonTable rows={rows} columns={columns} />
    </SkeletonGroup>
  );
}

/**
 * A small list that is already in hand and fits on one page (a section of a
 * record, a preview, a settings list): DataTable v2's frame, phone cards and
 * empty state with no sort, paging or URL. Server-safe like DataTable, so a
 * client component can pass render functions too.
 *
 *   <StaticTable label="Pledge payments" noun={{ one: "payment", many: "payments" }}
 *     columns={[…]} rows={payments} getRowId={(p) => p.id} />
 *
 * Anything that can grow past a page, or that people sort, uses DataTable
 * with a TableSpec instead.
 */
export function StaticTable<Row>({
  rows,
  ...rest
}: {
  label: string;
  noun: { one: string; many: string };
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowId: (row: Row) => string;
  getRowLabel?: (row: Row) => string;
  nextStep?: { header: string; render: (row: Row) => ReactNode };
  bulkActions?: DataTableBulkAction[];
  empty?: ReactNode;
  emptyMessage?: ReactNode;
  minWidth?: number;
}) {
  const pageSize = Math.max(rows.length, 1);
  return (
    <DataTable<Row>
      {...rest}
      data={{ rows, total: rows.length, page: 0, pageSize }}
      spec={{ sortable: [], defaultSort: null, pageSize }}
      state={{ page: 0, sort: null }}
      baseHref=""
    />
  );
}
