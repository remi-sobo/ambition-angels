import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import PageHeader from "../../_components/PageHeader";
import HubSpotSettings from "./_components/HubSpotSettings";
import { TYPE } from "@/lib/admin/typeScale";

// X7 — fundraising integrations / settings. Reads the service-only connections
// row directly (RLS deny-all → must use the service-role client server-side).
export const dynamic = "force-dynamic";

export default async function FundraisingSettingsPage() {
  let connected = false;
  let flags = { sync_out: false, sync_in: false, sync_gifts_as_deals: false };
  try {
    const { data } = await getSupabaseAdmin()
      .from("connections")
      .select("status, meta")
      .eq("provider", "hubspot")
      .limit(1)
      .maybeSingle();
    if (data) {
      connected = data.status === "active";
      const meta = (data.meta ?? {}) as Record<string, unknown>;
      flags = {
        sync_out: meta.sync_out === true,
        sync_in: meta.sync_in === true,
        sync_gifts_as_deals: meta.sync_gifts_as_deals === true,
      };
    }
  } catch {
    // connections table missing → treat as not connected (standalone).
  }

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[900px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader title="Fundraising settings" subtitle="Integrations & sync" />
        <HubSpotSettings
          connected={connected}
          tokenPresent={!!process.env.HUBSPOT_ACCESS_TOKEN}
          secretPresent={!!process.env.HUBSPOT_CLIENT_SECRET}
          flags={flags}
        />

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline">
            <h2 className={TYPE.cardTitle}>Data hygiene</h2>
            <p className="text-[11px] text-ink-3">Keep the constituent list clean</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div>
              <Link href="/admin/fundraising/import" className="text-sm font-semibold text-orange hover:text-orange-dark transition-colors">
                Import donors &amp; gifts from CSV →
              </Link>
              <p className="text-[11px] text-ink-3 mt-1">Map columns, preview, and commit — dedupes by email against existing constituents.</p>
            </div>
            <div>
              <Link href="/admin/fundraising/duplicates" className="text-sm font-semibold text-orange hover:text-orange-dark transition-colors">
                Find &amp; merge duplicates →
              </Link>
              <p className="text-[11px] text-ink-3 mt-1">Surfaces constituents that share an email so you can merge their history into one record.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
