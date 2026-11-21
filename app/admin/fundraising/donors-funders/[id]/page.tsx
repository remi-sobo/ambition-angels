import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import FeatureGate from "@/app/admin/_components/FeatureGate";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";
import DonorProfile from "../../donors/[id]/DonorProfile";
import ProspectProfile from "../../prospects/[id]/ProspectProfile";
import { resolveDonor360 } from "./resolve";

// Spec Fundraising F2 — Donor 360: ONE URL shape over BOTH id spaces (spec
// §The one-list rule). `constituents` and `fr_prospects` have disjoint
// UUIDs, and both /admin/fundraising/donors/[id] and .../prospects/[id]
// prefix-map here at F6 — so this route resolves constituents first and
// falls back to the prospect bench, rendering the matching variant IN
// PLACE. Never a redirect: at F6 the V1 detail routes 308 here, and a
// bounce back would loop.
//
// The prospect variant keeps V1's entitlement fence: the prospects section
// is gated ai.prospect_research (its layout), so the same FeatureGate wraps
// it here — an org without the key gets the not-authorized panel, exactly
// as the V1 URL behaves today. The donor variant needs only the
// modules.fundraising fence this route group already applies.
export const dynamic = "force-dynamic";

export default async function Donor360Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { activity?: string };
}) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  // RLS already hides donors from a role without fundraising.read; this says
  // so with the not-authorized panel instead of a bare 404 (V4 Stage P).
  const gate = await requirePagePermission("fundraising.read", "Fundraising");
  if (!gate.ok) return gate.page;
  const supabase = createServerSupabase();

  const kind = await resolveDonor360((table) =>
    supabase.from(table).select("id").eq("id", params.id).maybeSingle(),
  );
  if (kind === "constituent") return <DonorProfile id={params.id} v2 showAll={searchParams?.activity === "all"} />;
  if (kind === "prospect") {
    return (
      <FeatureGate feature="ai.prospect_research" label="Prospect Research">
        <ProspectProfile id={params.id} v2 />
      </FeatureGate>
    );
  }

  notFound();
}
