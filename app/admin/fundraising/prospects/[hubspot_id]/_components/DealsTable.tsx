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
    <section className="rounded-card border-[1.5px] border-outline bg-black/30 p-6">
      <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-4">
        Associated Deals
      </h2>

      {deals.length === 0 ? (
        <p className="text-sm text-ink-2">No deals associated.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-ink-2 border-b border-outline">
                <th className="text-left font-medium pb-2 pr-4">Deal</th>
                <th className="text-right font-medium pb-2 pr-4">Amount</th>
                <th className="text-left font-medium pb-2 pr-4">Stage</th>
                <th className="text-left font-medium pb-2 pr-4">Pipeline</th>
                <th className="text-left font-medium pb-2 pr-4">Close</th>
                <th className="text-left font-medium pb-2">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {deals.map((d) => (
                <tr key={d.hubspot_id} className="text-ink-1">
                  <td className="py-2.5 pr-4">{d.name ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-right font-mono">
                    {fmtAmount(d.amount)}
                  </td>
                  <td className="py-2.5 pr-4">
                    {d.stage ? (
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-tile border-[1.5px] border-outline">
                        {d.stage}
                      </span>
                    ) : (
                      <span className="text-ink-2">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-ink-2">
                    {d.pipeline ?? "—"}
                  </td>
                  <td className="py-2.5 pr-4">{fmtDate(d.close_date)}</td>
                  <td className="py-2.5">{fmtDate(d.last_activity_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
