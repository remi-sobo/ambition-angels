import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "../../../finance/_components/charts";
import StatCard from "../../../_components/StatCard";
import { constituentName } from "@/lib/fundraising/display";
import { analyzeDonor, FLAG_LABELS, FLAG_HELP } from "@/lib/fundraising/retention";
import { todayISO } from "../../../ops/_types/ops";
import { GiftEntryForm, GiftRowActions } from "../_components/GiftControls";
import { EditDonorButton, LogInteractionForm } from "../_components/ConstituentControls";
import { HouseholdControls } from "../_components/HouseholdControls";
import { AddSoftCredit, SoftCreditChip, SC_TYPE_LABEL } from "../_components/SoftCreditControls";

// Donor profile + giving timeline (Ring 2 Donors v1).
export const dynamic = "force-dynamic";

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Handles both calendar-day strings (gift_date, length 10) and full
// timestamps (occurred_at / acknowledged_at).
const fmtWhen = (s: string) =>
  new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function DonorProfilePage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const supabase = createServerSupabase();
  const [cRes, giftsRes, plansRes, allDatesRes, interactionsRes, campaignsRes, fundsRes, appealsRes, scReceivedRes] = await Promise.all([
    supabase.from("constituents").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("gifts")
      .select("id, amount, gift_date, method, acknowledgment_status, acknowledged_at, recurring_plan_id, external_source")
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
    // Attribution options for manual gift entry (Epic A).
    supabase.from("campaigns").select("id, name").order("created_at", { ascending: false }).limit(100),
    supabase.from("funds").select("id, name").order("name").limit(100),
    supabase.from("appeals").select("id, name").order("name").limit(200),
    // Soft credits this donor *received* (recognition only) — Epic D3.
    supabase.from("soft_credits").select("amount").eq("constituent_id", params.id).limit(5000),
  ]);

  // Query error = tables not applied yet (same grace state as the list
  // page); a clean miss = real 404.
  if (cRes.error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className="font-heading font-bold text-ink-1 text-2xl mb-4">Donors</h1>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
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
    acknowledgment_status: string; acknowledged_at: string | null;
    recurring_plan_id: string | null; external_source: string | null;
  }>).map((g) => ({ ...g, amount: Number(g.amount) }));
  const plans = (plansRes.data ?? []) as Array<{ id: string; amount: number; frequency: string; status: string }>;
  const interactions = (interactionsRes.data ?? []) as Array<{
    id: string; kind: string; occurred_at: string; notes: string | null; logged_by: string | null;
  }>;
  const campaignOpts = (campaignsRes.data ?? []) as Array<{ id: string; name: string }>;
  const fundOpts = (fundsRes.data ?? []) as Array<{ id: string; name: string }>;
  const appealOpts = (appealsRes.data ?? []) as Array<{ id: string; name: string }>;

  // Soft credits ON this donor's gifts (Epic D2): credited party + type per
  // gift, for the timeline.
  const giftIds = gifts.map((g) => g.id);
  const scByGift = new Map<string, Array<{ id: string; type: string; name: string }>>();
  if (giftIds.length > 0) {
    const { data: scRows } = await supabase
      .from("soft_credits")
      .select("id, gift_id, type, constituent:constituents ( type, first_name, last_name, org_name )")
      .in("gift_id", giftIds)
      .limit(2000);
    for (const sc of (scRows ?? []) as unknown as Array<{
      id: string; gift_id: string; type: string;
      constituent: { type: string; first_name: string | null; last_name: string | null; org_name: string | null } | null;
    }>) {
      const list = scByGift.get(sc.gift_id) ?? [];
      list.push({ id: sc.id, type: sc.type, name: sc.constituent ? constituentName(sc.constituent) : "Unknown" });
      scByGift.set(sc.gift_id, list);
    }
  }
  // Recognition received = soft credits where this donor is the credited party
  // (Epic D3). Revenue counts only hard-credit gifts; recognition adds these.
  const recognitionReceived = ((scReceivedRes.data ?? []) as Array<{ amount: number }>)
    .reduce((s, r) => s + Number(r.amount), 0);

  const total = gifts.reduce((s, g) => s + g.amount, 0);
  const recognition = total + recognitionReceived;
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

  // ── Household (Epic D1): the donor's household + combined member giving,
  // plus the list of households for the join control. ──
  const { data: householdsList } = await supabase
    .from("households")
    .select("id, name")
    .order("name")
    .limit(500);
  const households = (householdsList ?? []) as Array<{ id: string; name: string }>;
  const householdId = (c.household_id as string | null) ?? null;
  let household:
    | { name: string; total: number; members: Array<{ id: string; name: string; total: number }> }
    | null = null;
  if (householdId) {
    const [hhRes, membersRes] = await Promise.all([
      supabase.from("households").select("name").eq("id", householdId).maybeSingle(),
      supabase
        .from("constituents")
        .select("id, type, first_name, last_name, org_name")
        .eq("household_id", householdId),
    ]);
    const members = (membersRes.data ?? []) as Array<{
      id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null;
    }>;
    const memberIds = members.map((m) => m.id);
    const totals = new Map<string, number>();
    if (memberIds.length > 0) {
      const { data: hg } = await supabase
        .from("gifts")
        .select("constituent_id, amount")
        .in("constituent_id", memberIds)
        .limit(10000);
      for (const g of (hg ?? []) as Array<{ constituent_id: string | null; amount: number }>) {
        if (g.constituent_id) totals.set(g.constituent_id, (totals.get(g.constituent_id) ?? 0) + Number(g.amount));
      }
    }
    if (hhRes.data) {
      household = {
        name: hhRes.data.name as string,
        total: Array.from(totals.values()).reduce((s, v) => s + v, 0),
        members: members.map((m) => ({ id: m.id, name: constituentName(m), total: totals.get(m.id) ?? 0 })),
      };
    }
  }

  // ── Unified activity stream (Epic C): gifts + interactions + thank-yous,
  // newest first. gift_date is a calendar day (anchored at noon so it sorts
  // sanely against the timestamped events); the rest are timestamptz.
  type GiftEv = (typeof gifts)[number];
  type IntEv = (typeof interactions)[number];
  type Activity =
    | { kind: "gift"; sort: number; gift: GiftEv }
    | { kind: "interaction"; sort: number; interaction: IntEv }
    | { kind: "ack"; sort: number; at: string; amount: number };
  const ms = (s: string) => {
    const t = Date.parse(s);
    return Number.isNaN(t) ? 0 : t;
  };
  const activity: Activity[] = [
    ...gifts.map((g): Activity => ({ kind: "gift", sort: ms(g.gift_date + "T12:00:00"), gift: g })),
    ...interactions.map((i): Activity => ({ kind: "interaction", sort: ms(i.occurred_at), interaction: i })),
    ...gifts
      .filter((g) => g.acknowledgment_status === "sent" && g.acknowledged_at)
      .map((g): Activity => ({
        kind: "ack",
        sort: ms(g.acknowledged_at as string),
        at: g.acknowledged_at as string,
        amount: g.amount,
      })),
  ].sort((a, b) => b.sort - a.sort);

  return (
    <div className="min-h-screen bg-ink">
      <div className="bg-tile border-b border-outline px-4 lg:px-8 py-3 sm:py-4 sticky admin-sticky-top z-30 flex items-center gap-3">
        <Link href="/admin/fundraising/donors" className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors">
          ← Donors
        </Link>
        <span className="font-heading font-bold text-ink-1 text-sm sm:text-base truncate">{name}</span>
        {activePlan && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange/20 text-orange">
            Monthly · {money(Number(activePlan.amount))}
          </span>
        )}
        {c.do_not_contact && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-expense-bg text-expense">Do not contact</span>
        )}
        {flags.map((f) => (
          <span
            key={f}
            title={FLAG_HELP[f]}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              f === "cadence_lapsed"
                ? "bg-expense-bg text-expense"
                : f === "lybunt"
                ? "bg-[#F4E8D0] text-[#A56A1B]"
                : f === "second_gift_watch"
                ? "bg-blue-500/15 text-blue-400"
                : "bg-tile text-ink-2"
            }`}
          >
            {FLAG_LABELS[f]}
          </span>
        ))}
        {hubspotId && (
          <Link
            href={`/admin/fundraising/prospects/${hubspotId}`}
            className="ml-auto text-[11px] font-semibold px-3 py-1 rounded-full bg-tile border-[1.5px] border-outline text-ink-1 hover:text-ink-1 hover:bg-[#EFE6D4] transition-colors whitespace-nowrap"
          >
            {hasBrief ? "Research brief →" : "Run research →"}
          </Link>
        )}
      </div>

      <div className="max-w-[1100px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Lifetime Giving"
            value={money(total)}
            sub={recognitionReceived > 0 ? `${money(recognition)} recognition incl. soft credits` : undefined}
          />
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
          <section className="lg:col-span-4 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 space-y-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h2 className="font-heading font-bold text-ink-1 text-sm">Profile</h2>
              <EditDonorButton
                donor={{
                  id: c.id,
                  type: c.type === "organization" ? "organization" : "person",
                  first_name: c.first_name,
                  last_name: c.last_name,
                  org_name: c.org_name,
                  emails: (c.emails as string[]) ?? [],
                  phones: (c.phones as string[]) ?? [],
                  street: c.street,
                  city: c.city,
                  state: c.state,
                  postal_code: c.postal_code,
                  tags: (c.tags as string[]) ?? [],
                  do_not_contact: c.do_not_contact,
                  notes: c.notes,
                }}
              />
            </div>
            {[
              ["Type", c.type],
              ["Email", (c.emails as string[])[0] ?? "—"],
              ["Phone", (c.phones as string[])[0] ?? "—"],
              ["Address", [c.street, c.city, c.state, c.postal_code].filter(Boolean).join(", ") || "—"],
              ["Source", c.source],
              ["Tags", (c.tags as string[]).join(", ") || "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3 text-xs">
                <span className="text-ink-3 w-16 flex-shrink-0 uppercase tracking-wider font-semibold pt-px">{label}</span>
                <span className="text-ink-1 break-words min-w-0 capitalize">{String(value)}</span>
              </div>
            ))}
            {c.notes && <p className="text-xs text-ink-2 border-t border-outline pt-3">{c.notes}</p>}
          </section>

          <section className="lg:col-span-8 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-outline flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-heading font-bold text-ink-1 text-sm">Activity</h2>
              <div className="flex items-center gap-2">
                <LogInteractionForm constituentId={c.id} />
                <GiftEntryForm
                  constituentId={c.id}
                  campaigns={campaignOpts}
                  funds={fundOpts}
                  appeals={appealOpts}
                />
              </div>
            </div>
            {activity.length === 0 ? (
              <p className="p-6 text-ink-2 text-sm">
                No activity yet. Gifts, logged calls/emails/meetings, and thank-yous appear here.
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {activity.map((ev) => {
                  if (ev.kind === "gift") {
                    const g = ev.gift;
                    const scList = scByGift.get(g.id) ?? [];
                    return (
                      <li key={`g-${g.id}`} className="px-5 py-3 group">
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-ink-2 w-24 flex-shrink-0">{fmtWhen(g.gift_date)}</span>
                          <span className="text-[10px] uppercase tracking-wider text-revenue font-semibold w-14 flex-shrink-0">Gift</span>
                          <span className="font-bold text-ink-1 [font-variant-numeric:tabular-nums]">{money(g.amount)}</span>
                          <span className="text-[10px] uppercase tracking-wider text-ink-3">{g.method}</span>
                          {g.recurring_plan_id && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange/20 text-orange">Monthly</span>
                          )}
                          <span className="ml-auto text-[11px] flex items-center gap-3">
                            {g.acknowledgment_status === "sent" ? (
                              <span className="text-revenue">Thanked</span>
                            ) : g.acknowledgment_status === "pending" ? (
                              <span className="text-orange">Thank-you pending</span>
                            ) : (
                              <span className="text-ink-3">—</span>
                            )}
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <GiftRowActions id={g.id} />
                            </span>
                          </span>
                        </div>
                        <div className="mt-1 ml-24 flex flex-wrap items-center gap-1.5">
                          {scList.map((sc) => (
                            <SoftCreditChip
                              key={sc.id}
                              giftId={g.id}
                              id={sc.id}
                              label={`${sc.name} · ${SC_TYPE_LABEL[sc.type] ?? sc.type}`}
                            />
                          ))}
                          <AddSoftCredit giftId={g.id} />
                        </div>
                      </li>
                    );
                  }
                  if (ev.kind === "interaction") {
                    const i = ev.interaction;
                    return (
                      <li key={`i-${i.id}`} className="px-5 py-3 text-sm flex items-start gap-4">
                        <span className="text-xs text-ink-2 w-24 flex-shrink-0 pt-px">{fmtWhen(i.occurred_at)}</span>
                        <span className="text-[10px] uppercase tracking-wider text-orange font-semibold w-14 flex-shrink-0 pt-1">{i.kind}</span>
                        <div className="min-w-0">
                          {i.logged_by && <div className="text-xs text-ink-3">{i.logged_by}</div>}
                          {i.notes && <p className="text-ink-1 text-sm mt-0.5">{i.notes}</p>}
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li key={`a-${ev.at}-${ev.amount}`} className="px-5 py-3 flex items-center gap-4">
                      <span className="text-xs text-ink-2 w-24 flex-shrink-0">{fmtWhen(ev.at)}</span>
                      <span className="text-[10px] uppercase tracking-wider text-revenue font-semibold w-14 flex-shrink-0">Thanked</span>
                      <span className="text-xs text-ink-2">Thank-you sent for a {money(ev.amount)} gift</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-heading font-bold text-ink-1 text-sm">
              Household{household ? ` · ${household.name}` : ""}
            </h2>
            <HouseholdControls
              constituentId={c.id}
              currentHouseholdId={householdId}
              households={households}
            />
          </div>
          {household ? (
            <div className="px-5 py-4">
              <div className="text-xs text-ink-2 mb-3">
                Combined household giving{" "}
                <span className="font-bold text-ink-1 [font-variant-numeric:tabular-nums]">{money(household.total)}</span>
                {` · ${household.members.length} member${household.members.length === 1 ? "" : "s"}`}
              </div>
              <ul className="flex flex-wrap gap-2">
                {household.members.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/admin/fundraising/donors/${m.id}`}
                      className={`text-[11px] rounded-full px-3 py-1 border-[1.5px] border-outline transition-colors ${
                        m.id === c.id ? "bg-orange/10 text-orange" : "bg-tile text-ink-2 hover:text-orange"
                      }`}
                    >
                      {m.name} · {money(m.total)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="px-5 py-4 text-ink-2 text-sm">
              Not in a household. Create one to roll up giving for spouses or family, or join an
              existing household.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
