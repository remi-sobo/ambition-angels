import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import PageHeader from "../../_components/PageHeader";

// Strategy tab (Phase 1) — the internal twin of the public Strategy Room.
// Eight funding angles, now read from the strategy_angles table (seeded from
// app/strategy/StrategyRoom.tsx). Read-only this phase; the per-angle funnel
// (shortlist → qualified → researched → pursuing) lands in Phase 2.
export const dynamic = "force-dynamic";

type Angle = {
  id: string;
  key: string;
  name: string;
  status_badge: string | null;
  hook: string | null;
  funds: string | null;
  want: string | null;
  ask: string | null;
  approach: string | null;
  sort_order: number;
};

const BADGE: Record<string, { label: string; cls: string }> = {
  "north-star": { label: "North Star", cls: "bg-orange/15 text-orange" },
  proven: { label: "Proven", cls: "bg-revenue/15 text-revenue" },
  building: { label: "Building", cls: "bg-blue-500/15 text-blue-400" },
  reframed: { label: "Reframed", cls: "bg-[#F4E8D0] text-[#A56A1B]" },
  productizing: { label: "Productizing", cls: "bg-blue-500/15 text-blue-400" },
  "core-thesis": { label: "Core thesis", cls: "bg-orange/15 text-orange" },
  new: { label: "New & timely", cls: "bg-purple-500/15 text-purple-400" },
  "emerging-stub": { label: "Emerging stub", cls: "bg-tile text-ink-3 border border-outline" },
};

export default async function StrategyPage() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("strategy_angles")
    .select("id, key, name, status_badge, hook, funds, want, ask, approach, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
        <PageHeader title="Strategy" subtitle="Funding angles" />
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The <code className="text-orange">strategy_angles</code> table isn&apos;t in this database
          yet. Apply <code className="text-orange">create_strategy_angles.sql</code> via the Supabase
          SQL editor, then reload.
        </div>
      </div>
    );
  }

  const angles = (data ?? []) as Angle[];

  // Funder counts per angle for the card footer.
  const { data: faRows } = await supabase.from("funder_angles").select("angle_id");
  const counts = new Map<string, number>();
  for (const r of (faRows ?? []) as { angle_id: string }[]) {
    counts.set(r.angle_id, (counts.get(r.angle_id) ?? 0) + 1);
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title="Strategy"
        subtitle={`${angles.length} funding angles · the internal twin of the Strategy Room`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {angles.map((a) => {
          const badge = a.status_badge ? BADGE[a.status_badge] : null;
          return (
            <Link
              key={a.id}
              href={`/admin/fundraising/strategy/${a.key}`}
              className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 flex flex-col gap-3 hover:border-orange/40 transition-colors group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[11px] font-bold text-ink-3 [font-variant-numeric:tabular-nums] pt-0.5">
                    {String(a.sort_order).padStart(2, "0")}
                  </span>
                  <h2 className="font-heading font-bold text-ink-1 text-sm leading-tight">{a.name}</h2>
                </div>
                {badge && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`}>
                    {badge.label}
                  </span>
                )}
              </div>

              {a.hook && <p className="text-ink-1 text-sm font-medium leading-snug">{a.hook}</p>}

              <dl className="grid grid-cols-1 gap-2 text-xs border-t border-outline pt-3">
                {a.funds && (
                  <div>
                    <dt className="text-ink-3 uppercase tracking-wider font-semibold text-[10px]">Who funds this</dt>
                    <dd className="text-ink-2 mt-0.5 leading-snug">{a.funds}</dd>
                  </div>
                )}
                {a.want && (
                  <div>
                    <dt className="text-ink-3 uppercase tracking-wider font-semibold text-[10px]">What they want</dt>
                    <dd className="text-ink-2 mt-0.5 leading-snug">{a.want}</dd>
                  </div>
                )}
                {a.ask && (
                  <div>
                    <dt className="text-ink-3 uppercase tracking-wider font-semibold text-[10px]">Ask</dt>
                    <dd className="text-ink-2 mt-0.5 leading-snug">{a.ask}</dd>
                  </div>
                )}
                {a.approach && (
                  <div>
                    <dt className="text-ink-3 uppercase tracking-wider font-semibold text-[10px]">Approach</dt>
                    <dd className="text-ink-2 mt-0.5 leading-snug">{a.approach}</dd>
                  </div>
                )}
              </dl>

              <div className="border-t border-outline pt-3 flex items-center justify-between text-[11px]">
                <span className="text-ink-3">
                  {counts.get(a.id) ?? 0} funder{(counts.get(a.id) ?? 0) === 1 ? "" : "s"}
                </span>
                <span className="font-semibold text-ink-2 group-hover:text-orange transition-colors">
                  Open funnel →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
