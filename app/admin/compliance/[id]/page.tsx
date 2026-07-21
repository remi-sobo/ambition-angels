import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { getEntityHistory } from "@/lib/admin/history";
import StatCard from "../../_components/StatCard";
import { EntityTasks } from "../../_components/EntityTasks";
import { EntityDocuments } from "../../_components/EntityDocuments";
import { CommentThread } from "../../_components/CommentThread";
import { EntityHistory } from "../../_components/EntityHistory";
import { TYPE } from "@/lib/admin/typeScale";
import {
  KIND_LABELS,
  type ComplianceItem,
} from "../_components/ComplianceControls";
import { handleLabel } from "@/lib/admin/assignees";
import {
  ItemStatusActions,
  EditItemDetails,
  NotesAndChecklist,
  FilingsPanel,
  type ComplianceFiling,
} from "./_components/ComplianceDetailControls";

// Compliance item profile (governance profile views): one deadline's full
// record — core fields, notes + checklist, the permanent filing history the
// rolling calendar otherwise erases, and the standard record panels (tasks,
// documents, comments, audit history).
export const dynamic = "force-dynamic";

const fmtDate = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  in_progress: "In progress",
  filed: "Filed",
  waived: "Waived",
};

export default async function ComplianceItemPage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const supabase = getSupabaseAdmin();
  // Org fence: the service-role client bypasses RLS — scope every read to the
  // caller's org (a foreign id must 404, not leak).
  const ctx = await getOrgContext();
  if (!ctx) notFound();
  const orgId = ctx.orgId;

  const [itemRes, filingsRes, history] = await Promise.all([
    supabase.from("compliance_items").select("*").eq("org_id", orgId).eq("id", params.id).maybeSingle(),
    supabase
      .from("compliance_filings")
      .select("id, filed_date, period_due_date, filed_by, confirmation, fee, notes")
      .eq("org_id", orgId)
      .eq("item_id", params.id)
      .order("filed_date", { ascending: false })
      .limit(100),
    getEntityHistory(orgId, "compliance_item", params.id),
  ]);
  if (!itemRes.data) notFound();
  const item = itemRes.data as ComplianceItem;
  const filings = (filingsRes.data ?? []) as ComplianceFiling[];

  const today = new Date().toISOString().slice(0, 10);
  const openItem = item.status === "upcoming" || item.status === "in_progress";
  const overdue = openItem && item.due_date < today;
  const checklist = item.checklist ?? [];
  const checklistDone = checklist.filter((c) => c.done).length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <Link href="/admin/compliance" className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors">
          ← Compliance
        </Link>
        <h1 className={`${TYPE.pageTitle} !text-lg`}>{item.title}</h1>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-tile text-ink-2 uppercase tracking-wider">
          {KIND_LABELS[item.kind] ?? item.kind}
        </span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            overdue
              ? "bg-expense/10 text-expense"
              : item.status === "in_progress"
              ? "bg-[#F4E8D0] text-[#A56A1B]"
              : "bg-tile text-ink-2"
          }`}
        >
          {overdue ? "Overdue" : STATUS_LABELS[item.status] ?? item.status}
        </span>
        <div className="ml-auto">
          <ItemStatusActions item={item} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Due"
          value={fmtDate(item.due_date)}
          sub={overdue ? "overdue" : undefined}
        />
        <StatCard
          label="Repeats"
          value={item.recur === "none" ? "One-time" : item.recur}
          sub={item.recur !== "none" ? "rolls forward on filing" : undefined}
        />
        <StatCard
          label="Last filed"
          value={item.last_filed_at ? fmtDate(item.last_filed_at.slice(0, 10)) : "—"}
          sub={`${filings.length} filing${filings.length === 1 ? "" : "s"} on record`}
          muted={!item.last_filed_at}
        />
        <StatCard
          label="Checklist"
          value={checklist.length > 0 ? `${checklistDone}/${checklist.length}` : "—"}
          sub="prep items"
          muted={checklist.length === 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-5 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 space-y-3 self-start">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h2 className={TYPE.cardTitle}>Details</h2>
            <EditItemDetails item={item} />
          </div>
          {[
            ["Type", KIND_LABELS[item.kind] ?? item.kind],
            ["Jurisdiction", item.jurisdiction && item.jurisdiction !== "—" ? item.jurisdiction : "—"],
            ["Assigned to", item.assigned_to ? handleLabel(item.assigned_to) : "Unassigned"],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-3 text-xs">
              <span className="text-ink-3 w-24 flex-shrink-0 uppercase tracking-wider font-semibold pt-px">
                {label}
              </span>
              <span className="text-ink-1 break-words min-w-0">{String(value)}</span>
            </div>
          ))}
          <div className="border-t border-outline pt-3">
            <NotesAndChecklist item={item} />
          </div>
        </section>

        <div className="lg:col-span-7 space-y-4">
          <EntityTasks
            entityType="compliance_item"
            entityId={item.id}
            entityLabel={item.title}
            defaultCategory="compliance"
          />
          <EntityDocuments entityType="compliance_item" entityId={item.id} entityLabel={item.title} />
          <FilingsPanel itemId={item.id} filings={filings} />
          <CommentThread entityType="compliance_item" entityId={item.id} entityLabel={item.title} />
          <EntityHistory events={history} />
        </div>
      </div>
    </div>
  );
}
