import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { money } from "../../../finance/_components/charts";
import StatCard from "../../../_components/StatCard";
import { constituentName } from "@/lib/fundraising/display";
import { analyzeDonor, FLAG_LABELS, FLAG_HELP } from "@/lib/fundraising/retention";
import { todayISO } from "../../../ops/_types/ops";

// Donor profile + giving timeline (Ring 2 Donors v1).
export const dynamic = "force-dynamic";

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function DonorProfilePage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const supabase = getSupabaseAdmin();
  const [cRes, giftsRes, plansRes, allDatesRes, interactionsRes] = await Promise.all([
    supabase.from("constituents").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("gifts")
      .select("id, amount, gift_date, method, acknowledgment_status, recurring_plan_id, external_source")
      .eq("constituent_id", params.id)
      .order("gift_date", { ascending: false })
      .limit(500),
    supabase
      .from("recurring_plans")
      .select("id, amount, frequency, status")
      .eq("constituent_id", params.id),
    // Full date history (dates only, cheap) — drives the first-gift stat
    // AND retention flags, independent of the timeline's display cap.
    supabase
      .from("gifts")
      .select("gift_date")
      .eq("constituent_id", params.id)
      .order("gift_date", { ascending: true })
      .limit(5000),
    supabase
      .from("interactions")
      .select("id, kind, occurred_at, notes, logged_by")
      .eq("constituent_id", params.id)
      .order("occurred_at", { ascending: false })
      .limit(50),
  ]);

  // Query error = tables not applied yet (same grace state as the list
  // page); a clean miss = real 404.
  if (cRes.error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className="font-heading font-bold text-cream text-2xl mb-4">Donors</h1>
        <div className="bg-[#231f18] border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-gray-mid leading-relaxed">
          The fundraising tables aren&apos;t in this database yet. Apply{" "}
          <code className="text-orange">create_fundraising_core.sql</code> via Actions → Apply DB
          migration, then reload.
        </div>
      </div>
    );
  }
  if (!cRes.data) notFound();
  const c = cRes.data;
  const gifts = ((giftsRes.data ?? []) as Array<{
    id: string; amount: number; gift_date: string; method: string;
    acknowledgment_status: string; recurring_plan_id: string | null; external_source: string | null;
  }>).map((g) => ({ ...g, amount: Number(g.amount) }));
  const plans = (plansRes.data ?? []) as Array<{ id: string; amount: number; frequency: string; status: string }>;
  const interactions = (interactionsRes.data ?? []) as Array<{
    id: string; kind: string; occurred_at: string; notes: string | null; logged_by: string | null;
  }>;

  const total = gifts.reduce((s, g) => s + g.amount, 0);
  const name = constituentName(c);
  const activePlan = plans.find((p) => p.status === "active");
  const allDates = ((allDatesRes.data ?? []) as Array<{ gift_date: string }>).map((g) => g.gift_date);
  const { flags } = analyzeDonor(allDates, todayISO(), Boolean(activePlan));
  const pendingAcks = gifts.filter((g) => g.acknowledgment_status === "pending").length;

  // Funder-research attach: constituents imported from (or matched to)
  // HubSpot carry external_ids.hubspot, which keys the research agent's
  // briefs. Link straight to the brief when one exists; otherwise to the
  // prospect page where the agent can be run.
  const extIds = (c.external_ids ?? {}) as Record<string, unknown>;
  const hubspotId = typeof extIds["hubspot"] === "string" ? (extIds["hubspot"] as string) : null;
  let hasBrief = false;
  if (hubspotId) {
    const { data: brief } = await supabase
      .from("fr_prospect_briefs")
      .select("hubspot_id")
      .eq("hubspot_id", hubspotId)
      .maybeSingle();
    hasBrief = !!brief;
  }

  return (
    <div className="min-h-screen bg-ink">
      <div className="bg-[#19150f] border-b border-white/10 px-4 lg:px-8 py-3 sm:py-4 sticky admin-sticky-top z-30 flex items-center gap-3">
        <Link href="/admin/fundraising/donors" className="text-xs font-semibold text-gray-mid hover:text-cream transition-colors">
          ← Donors
        </Link>
        <span className="font-heading font-bold text-cream text-sm sm:text-base truncate">{name}</span>
        {activePlan && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange/20 text-orange">
            Monthly · {money(Number(activePlan.amount))}
          </span>
        )}
        {c.do_not_contact && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">Do not contact</span>
        )}
        {flags.map((f) => (
          <span
            key={f}
            title={FLAG_HELP[f]}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              f === "cadence_lapsed"
                ? "bg-red-500/15 text-red-400"
                : f === "lybunt"
                ? "bg-amber-500/15 text-amber-400"
                : f === "second_gift_watch"
                ? "bg-blue-500/15 text-blue-400"
                : "bg-white/10 text-gray-mid"
            }`}
          >
            {FLAG_LABELS[f]}
          </span>
        ))}
        {hubspotId && (
          <Link
            href={`/admin/fundraising/prospects/${hubspotId}`}
            className="ml-auto text-[11px] font-semibold px-3 py-1 rounded-full bg-white/5 border border-white/10 text-cream/80 hover:text-cream hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            {hasBrief ? "Research brief →" : "Run research →"}
          </Link>
        )}
      </div>

      <div className="max-w-[1100px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Lifetime Giving" value={money(total)} />
          <StatCard label="Gifts" value={gifts.length} sub={gifts.length > 0 ? `latest ${fmtDate(gifts[0].gift_date)}` : undefined} />
          <StatCard
            label="First Gift"
            value={allDates[0] ? fmtDate(allDates[0]) : "—"}
          />
          <StatCard
            label="Acknowledgments"
            value={pendingAcks}
            sub={pendingAcks > 0 ? "gifts awaiting a thank-you" : "all caught up"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <section className="lg:col-span-4 bg-[#231f18] border border-white/10 rounded-card-lg p-5 space-y-3">
            <h2 className="font-heading font-bold text-cream text-sm mb-1">Profile</h2>
            {[
              ["Type", c.type],
              ["Email", (c.emails as string[])[0] ?? "—"],
              ["Phone", (c.phones as string[])[0] ?? "—"],
              ["Address", [c.street, c.city, c.state, c.postal_code].filter(Boolean).join(", ") || "—"],
              ["Source", c.source],
              ["Tags", (c.tags as string[]).join(", ") || "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3 text-xs">
                <span className="text-white/30 w-16 flex-shrink-0 uppercase tracking-wider font-semibold pt-px">{label}</span>
                <span className="text-cream/85 break-words min-w-0 capitalize">{String(value)}</span>
              </div>
            ))}
            {c.notes && <p className="text-xs text-gray-mid border-t border-white/10 pt-3">{c.notes}</p>}
          </section>

          <section className="lg:col-span-8 bg-[#231f18] border border-white/10 rounded-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10">
              <h2 className="font-heading font-bold text-cream text-sm">Giving Timeline</h2>
            </div>
            {gifts.length === 0 ? (
              <p className="p-6 text-gray-mid text-sm">No gifts recorded.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {gifts.map((g) => (
                  <li key={g.id} className="px-5 py-3 flex items-center gap-4">
                    <span className="text-xs text-gray-mid w-24 flex-shrink-0">{fmtDate(g.gift_date)}</span>
                    <span className="font-bold text-cream [font-variant-numeric:tabular-nums]">{money(g.amount)}</span>
                    <span className="text-[10px] uppercase tracking-wider text-white/30">{g.method}</span>
                    {g.recurring_plan_id && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange/20 text-orange">Monthly</span>
                    )}
                    <span className="ml-auto text-[11px]">
                      {g.acknowledgment_status === "sent" ? (
                        <span className="text-green-400">Thanked</span>
                      ) : g.acknowledgment_status === "pending" ? (
                        <span className="text-orange">Thank-you pending</span>
                      ) : (
                        <span className="text-white/25">—</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="bg-[#231f18] border border-white/10 rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10">
            <h2 className="font-heading font-bold text-cream text-sm">Interactions</h2>
          </div>
          {interactions.length === 0 ? (
            <p className="p-6 text-gray-mid text-sm">
              No touches logged yet. Calls, emails, and meetings will appear here as the
              communication log fills in.
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {interactions.map((i) => (
                <li key={i.id} className="px-5 py-3 text-sm flex items-start gap-4">
                  <span className="text-[10px] uppercase tracking-wider text-orange font-semibold w-16 flex-shrink-0 pt-1">{i.kind}</span>
                  <div className="min-w-0">
                    <div className="text-xs text-gray-mid">
                      {new Date(i.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {i.logged_by ? ` · ${i.logged_by}` : ""}
                    </div>
                    {i.notes && <p className="text-cream/85 text-sm mt-0.5">{i.notes}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
