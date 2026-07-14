import { getSupabaseAdmin } from "@/lib/supabase/admin";
import StatCard from "../_components/StatCard";
import PageHeader from "../_components/PageHeader";
import SectionSummary from "../_components/SectionSummary";
import {
  ComplianceRow,
  NewComplianceForm,
  type ComplianceItem,
} from "./_components/ComplianceControls";

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

export default async function CompliancePage() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("compliance_items")
    .select("*")
    .order("due_date")
    .limit(200);
  const items = (data ?? []) as ComplianceItem[];

  const today = new Date().toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
  const open = items.filter((i) => i.status === "upcoming" || i.status === "in_progress");
  const overdue = open.filter((i) => i.due_date < today);
  const due60 = open.filter((i) => i.due_date >= today && i.due_date <= in60);
  const later = open.filter((i) => i.due_date > in60);
  const closed = items.filter((i) => i.status === "filed" || i.status === "waived");

  const Section = ({ title, rows, tone }: { title: string; rows: ComplianceItem[]; tone?: "red" }) =>
    rows.length === 0 ? null : (
      <section>
        <h2
          className={`text-[11px] font-semibold uppercase tracking-wider mb-2 ${
            tone === "red" ? "text-expense" : "text-ink-2"
          }`}
        >
          {title} ({rows.length})
        </h2>
        <div className="space-y-2">
          {rows.map((i) => (
            <ComplianceRow key={i.id} item={i} />
          ))}
        </div>
      </section>
    );

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1000px]">
      <PageHeader
        title="Compliance"
        subtitle="Filings, renewals, and policy deadlines — none of them live in someone's head"
        actions={<NewComplianceForm />}
      />

      <SectionSummary section="compliance" />

      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatCard
          label="Overdue"
          value={overdue.length}
          sub={overdue.length > 0 ? "act now" : "clear"}
          muted={overdue.length === 0}
        />
        <StatCard label="Due in 60 days" value={due60.length} />
        <StatCard label="Tracked items" value={items.length} sub="rolls forward on filing" />
      </div>

      <div className="space-y-8">
        <Section title="Overdue" rows={overdue} tone="red" />
        <Section title="Next 60 days" rows={due60} />
        <Section title="Later" rows={later} />
        <Section title="Filed / waived" rows={closed} />
        {items.length === 0 && (
          <p className="text-sm text-ink-2">
            No compliance items — the seed template didn&apos;t load. Add your first deadline above.
          </p>
        )}
      </div>
    </div>
  );
}
