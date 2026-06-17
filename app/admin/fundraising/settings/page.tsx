import { getSupabaseAdmin } from "@/lib/supabase/admin";
import PageHeader from "../../_components/PageHeader";
import HubSpotSettings from "./_components/HubSpotSettings";

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
      </div>
    </div>
  );
}
