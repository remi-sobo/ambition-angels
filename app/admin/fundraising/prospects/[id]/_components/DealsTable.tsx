import { TYPE } from "@/lib/admin/typeScale";
import { StaticTable } from "@/app/admin/_components/ui/DataTable";
export type HsDeal = {
  hubspot_id: string;
  name: string | null;
  amount: number | null;
  stage: string | null;
  pipeline: string | null;
  close_date: string | null;
  last_activity_at: string | null;
};

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fmtAmount(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return USD.format(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DealsTable({ deals }: { deals: HsDeal[] }) {
  return (
    <section className="rounded-panel border-hairline bg-surface p-6">
      <h2 className={`${TYPE.sectionHeader} mb-4`}>
        Associated Deals
      </h2>

      {deals.length === 0 ? (
        <p className="text-sm text-ink-2">No deals associated.</p>
      ) : (
        // The kit table (V4 P1): cards under 640px.
        <StaticTable
          label="Associated deals"
          noun={{ one: "deal", many: "deals" }}
          rows={deals}
          getRowId={(d) => d.hubspot_id}
          getRowLabel={(d) => d.name ?? "Deal"}
          columns={[
            { key: "deal", header: "Deal", card: "title", render: (d) => <span className="text-ink-1">{d.name ?? "—"}</span> },
            { key: "amount", header: "Amount", align: "right", render: (d) => <span className="font-mono">{fmtAmount(d.amount)}</span> },
            {
              key: "stage",
              header: "Stage",
              render: (d) =>
                d.stage ? (
                  <span className="inline-block px-2 py-0.5 rounded text-xs bg-tile border-hairline">{d.stage}</span>
                ) : (
                  <span className="text-ink-2">—</span>
                ),
            },
            { key: "pipeline", header: "Pipeline", render: (d) => <span className="text-ink-2">{d.pipeline ?? "—"}</span> },
            { key: "close", header: "Close", render: (d) => fmtDate(d.close_date) },
            { key: "activity", header: "Last activity", render: (d) => fmtDate(d.last_activity_at) },
          ]}
        />
      )}
    </section>
  );
}
