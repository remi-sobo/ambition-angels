import { getSupabaseAdmin } from "@/lib/supabase/admin";
import EmptyState from "../_components/EmptyState";
import { getOrgContext } from "@/lib/admin/auth";
import Link from "next/link";
import DataTable, { type DataTableColumn } from "../_components/ui/DataTable";
import SavedViews from "../_components/ui/SavedViews";
import Figure, { SummaryStrip } from "../_components/ui/Figure";
import Badge, { type BadgeTone } from "../_components/ui/Badge";
import { handleLabel } from "@/lib/admin/assignees";
import { CALENDAR_VIEWS, complianceNextStep, inView, type CalendarView } from "@/lib/admin/compliance/calendar";
import { KIND_LABELS, RECUR_OPTIONS } from "./_components/labels";
import PageHeader from "../_components/PageHeader";
import SectionSummary from "../_components/SectionSummary";
import {
  ComplianceRowActions,
  NewComplianceForm,
  type ComplianceItem,
} from "./_components/ComplianceControls";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

// Compliance calendar (Ring 4, modules/07-governance.md): every filing,
// renewal, and policy deadline in one tickler. Marking an item filed rolls
// its date forward a period — the calendar maintains itself. The daily
// reminder email nudges at T-14/7/1 and on overdue.
//
// Items come from exactly two places: the one-time 501(c)(3) template seed
// in supabase/migrations/create_compliance.sql, and manual entry via the
// "New item" form below. A recurring filing is ONE row that always shows
// its NEXT due date — a quarterly item shows only the upcoming quarter, and
// the next one appears when it's marked filed. (This also feeds the
// Command Center Action Queue via v_action_items.)
export const dynamic = "force-dynamic";

const RECUR_LABEL = Object.fromEntries(RECUR_OPTIONS);
const STATUS_LABEL: Record<string, string> = { upcoming: "Upcoming", in_progress: "In progress", filed: "Filed", waived: "Waived" };
const STATUS_TONE: Record<string, BadgeTone> = { upcoming: "neutral", in_progress: "warning", filed: "success", waived: "neutral" };

export default async function CompliancePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const roleGate = await requirePagePermission("compliance.read", "Compliance");
  if (!roleGate.ok) return roleGate.page;
  const supabase = getSupabaseAdmin();
  // Org fence: the service-role client bypasses RLS, so the read is scoped to
  // the active org. No session → empty.
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Compliance" subtitle="Sign in to view the compliance calendar." />
      </div>
    );
  }
  const { data, error } = await supabase
    .from("compliance_items")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("due_date")
    .limit(200);
  const items = (data ?? []) as ComplianceItem[];

  const today = new Date().toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
  const open = items.filter((i) => i.status === "upcoming" || i.status === "in_progress");
  const overdue = open.filter((i) => i.due_date < today);
  const due60 = open.filter((i) => i.due_date >= today && i.due_date <= in60);
  const rawView = Array.isArray(searchParams?.view) ? searchParams?.view[0] : searchParams?.view;
  const view: CalendarView = CALENDAR_VIEWS.some((v) => v.key === rawView) ? (rawView as CalendarView) : "open";
  const rows = items.filter((i) => inView(i, view, today));
  const BASE = "/admin/organization/compliance";
  const readFailed = !!error;

  const columns: DataTableColumn<ComplianceItem>[] = [
    {
      key: "title",
      header: "Deadline",
      card: "title",
      render: (i) => (
        <>
          <Link href={`${BASE}/${i.id}`} className="font-semibold text-ink-1 hover:text-orange transition-colors">
            {i.title}
          </Link>
          <span className="block text-xs text-ink-2">
            {KIND_LABELS[i.kind] ?? i.kind}
            {i.jurisdiction && i.jurisdiction !== "—" ? ` · ${i.jurisdiction}` : ""}
          </span>
        </>
      ),
    },
    {
      key: "due",
      header: "Due",
      className: "tabular-nums",
      render: (i) => (
        <>
          <span className={inView(i, "overdue", today) ? "text-status-critical-text font-semibold" : "text-ink-1"}>{i.due_date}</span>
          <span className="block text-xs text-ink-2">{RECUR_LABEL[i.recur] ?? i.recur}</span>
        </>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      className: "text-ink-2",
      render: (i) => (i.assigned_to ? handleLabel(i.assigned_to) : <span className="text-ink-3">No owner</span>),
    },
    {
      key: "status",
      header: "Status",
      render: (i) => <Badge tone={STATUS_TONE[i.status] ?? "neutral"}>{STATUS_LABEL[i.status] ?? i.status}</Badge>,
    },
    { key: "actions", header: "Actions", align: "right", render: (i) => <ComplianceRowActions item={i} /> },
  ];

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-workspace">
      <PageHeader
        title="Compliance"
        subtitle="Filings, renewals and policy deadlines, so none of them live in someone's head"
        primaryAction={<NewComplianceForm />}
        moreActions={[
          { label: "Board", href: "/admin/organization/board" },
          { label: "Documents", href: "/admin/work/documents" },
        ]}
      />

      <SectionSummary section="compliance" />

      {items.length === 0 && !readFailed ? (
        <EmptyState
          label="compliance items"
          title="No deadlines yet"
          purpose="Filings, renewals and policy deadlines in one calendar. A recurring filing rolls forward each time you mark it filed."
          primaryAction={<NewComplianceForm />}
          next="Reminders go out 14, 7 and 1 days before each due date, and when one is late."
        />
      ) : (
        <>
          <SavedViews
            label="Compliance views"
            activeKey={view}
            views={CALENDAR_VIEWS.map((v) => ({
              key: v.key,
              label: v.label,
              href: v.key === "open" ? BASE : `${BASE}?view=${v.key}`,
              count: items.filter((i) => inView(i, v.key, today)).length,
            }))}
          />
          <SummaryStrip label="Compliance summary">
            <Figure
              label="Overdue"
              value={readFailed ? null : overdue.length}
              source="Open and past the due date"
              compareTone="danger"
              href={overdue.length > 0 ? `${BASE}?view=overdue` : undefined}
            />
            <Figure label="Due in 60 days" value={readFailed ? null : due60.length} source="Open, due from today through the next 60 days" />
            <Figure label="Tracked deadlines" value={readFailed ? null : items.length} source="Every row rolls forward when filed" />
          </SummaryStrip>
          <DataTable
            label="Compliance deadlines"
            noun={{ one: "deadline", many: "deadlines" }}
            columns={columns}
            nextStep={{
              header: "Next step",
              render: (i) => {
                const n = complianceNextStep(i, today);
                return (
                  <span className={n.tone === "late" ? "text-status-critical-text font-semibold" : n.tone === "due" ? "text-ink-1" : "text-ink-2"}>
                    {n.text}
                  </span>
                );
              },
            }}
            data={{ rows, total: rows.length, page: 0, pageSize: 200, error: readFailed ? "The calendar could not be read." : null }}
            getRowId={(i) => i.id}
            getRowLabel={(i) => i.title}
            spec={{ sortable: [], defaultSort: null, pageSize: 200 }}
            state={{ page: 0, sort: null }}
            baseHref={BASE}
            filters={view === "open" ? {} : { view }}
            emptyMessage={view === "overdue" ? "Nothing is overdue." : "No deadlines in this view."}
          />
        </>
      )}
    </div>
  );
}
