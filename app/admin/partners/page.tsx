import { getSupabaseAdmin } from "@/lib/supabase/admin";
import StatCard from "../_components/StatCard";
import PageHeader from "../_components/PageHeader";
import { PartnerRow, NewPartnerForm, type Partner } from "./_components/PartnerControls";
import { STATUS_ORDER, STATUS_LABELS } from "./_lib/status";

// Schools & nonprofit partners (Ring 3, modules/02-program.md "Schools"):
// the partner CRM — status pipeline, champion contact, MOU/data-agreement
// tracking with renewal countdowns, and touch cadence. The public
// /program-partners signup form feeds prospects in automatically.
export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("partners")
    .select("*")
    .order("last_touch_at", { ascending: false, nullsFirst: false })
    .limit(300);
  const partners = (data ?? []) as Partner[];

  const today = new Date().toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
  const live = partners.filter((p) => p.status !== "lapsed");
  const active = partners.filter((p) => p.status === "active" || p.status === "anchor");
  const mouExpiring = live.filter(
    (p) => p.mou_status === "signed" && p.mou_end && p.mou_end >= today && p.mou_end <= in90
  );
  const mouExpired = live.filter(
    (p) => p.mou_status === "signed" && p.mou_end && p.mou_end < today
  );
  const staleTouch = active.filter(
    (p) =>
      !p.last_touch_at ||
      p.last_touch_at < new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
  );

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title="Schools & Partners"
        subtitle="Prospect → outreach → pilot → active → anchor · MOUs, champions, touch cadence"
        actions={<NewPartnerForm />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Active partners" value={active.length} sub={`${live.length} in pipeline`} />
        <StatCard
          label="MOUs expiring"
          value={mouExpiring.length + mouExpired.length}
          sub={mouExpired.length > 0 ? `${mouExpired.length} already expired` : "next 90 days"}
          muted={mouExpiring.length + mouExpired.length === 0}
        />
        <StatCard
          label="Need a touch"
          value={staleTouch.length}
          sub="active, 30+ days quiet"
          muted={staleTouch.length === 0}
        />
        <StatCard label="Inbound prospects" value={partners.filter((p) => p.status === "prospect").length} sub="incl. signup form" />
      </div>

      <div className="space-y-8">
        {STATUS_ORDER.map((status) => {
          const rows = partners.filter((p) => p.status === status);
          if (rows.length === 0) return null;
          return (
            <section key={status}>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70 mb-2">
                {STATUS_LABELS[status]} ({rows.length})
              </h2>
              <div className="space-y-2">
                {rows.map((p) => (
                  <PartnerRow key={p.id} partner={p} />
                ))}
              </div>
            </section>
          );
        })}
        {partners.length === 0 && (
          <p className="text-sm text-gray-mid">
            No partners yet — add your first school or nonprofit partner, or wait for the public
            signup form to feed prospects in.
          </p>
        )}
      </div>
    </div>
  );
}
