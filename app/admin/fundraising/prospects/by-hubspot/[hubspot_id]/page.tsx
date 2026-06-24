import { redirect, notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

// Resolver for legacy/cross-surface links that reference a HubSpot contact id
// (donor page, strategy board, pipeline board). Maps the contact to its bench
// prospect — benching it from the mirror on first view — then redirects to the
// canonical /prospects/[id] detail.
export const dynamic = "force-dynamic";

export default async function ResolveByHubspot({ params }: { params: { hubspot_id: string } }) {
  const hubspotId = params.hubspot_id;
  const supabase = createServerSupabase();

  const { data: existing } = await supabase
    .from("fr_prospects")
    .select("id")
    .eq("hubspot_contact_id", hubspotId)
    .maybeSingle();
  if (existing) redirect(`/admin/fundraising/prospects/${existing.id}`);

  // Not benched yet — pull the mirror contact and add it.
  const { data: contact } = await supabase
    .from("hs_contacts")
    .select("hubspot_id, first_name, last_name, email, company")
    .eq("hubspot_id", hubspotId)
    .maybeSingle();
  if (!contact) notFound();

  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    contact.company ||
    contact.email ||
    "Unknown";

  const { data: created, error } = await supabase
    .from("fr_prospects")
    .insert({
      hubspot_contact_id: hubspotId,
      source: "hubspot",
      type: "individual",
      name,
      email: contact.email,
      org_name: contact.company,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !created) {
    // Lost a race (benched concurrently) or insert failed — re-resolve.
    const { data: again } = await supabase
      .from("fr_prospects")
      .select("id")
      .eq("hubspot_contact_id", hubspotId)
      .maybeSingle();
    if (again) redirect(`/admin/fundraising/prospects/${again.id}`);
    notFound();
  }
  redirect(`/admin/fundraising/prospects/${created.id}`);
}
