import type { SupabaseClient } from "@supabase/supabase-js";

// Promote a single HubSpot mirror prospect (hs_contacts) into a spine
// constituent so it can join a Strategy angle. Match-or-create, mirroring the
// bulk importer but for one contact on demand:
//   1. already linked → return the constituent stamped with this hubspot id
//   2. email matches an existing constituent → stamp external_ids.hubspot on it
//   3. otherwise create a person constituent from the mirror fields
// Never writes the mirror. Returns the resolved constituent id.

export type PromoteResult = { constituentId: string } | { error: string; status: number };

export async function promoteHsContact(
  supabase: SupabaseClient,
  orgId: string,
  hubspotId: string
): Promise<PromoteResult> {
  const id = typeof hubspotId === "string" ? hubspotId.trim() : "";
  if (!id) return { error: "hubspot_id is required", status: 400 };

  // 1. Already linked.
  const { data: linked } = await supabase
    .from("constituents")
    .select("id")
    .eq("external_ids->>hubspot", id)
    .limit(1)
    .maybeSingle();
  if (linked) return { constituentId: linked.id };

  // Load the mirror row.
  const { data: hs } = await supabase
    .from("hs_contacts")
    .select("hubspot_id, email, first_name, last_name")
    .eq("hubspot_id", id)
    .maybeSingle();
  if (!hs) return { error: "Prospect not found in the HubSpot mirror", status: 404 };

  const email = typeof hs.email === "string" && hs.email ? hs.email.toLowerCase() : null;

  // 2. Email matches an existing constituent → stamp the hubspot id on it.
  if (email) {
    const { data: byEmail } = await supabase
      .from("constituents")
      .select("id, external_ids")
      .contains("emails", [email])
      .limit(1)
      .maybeSingle();
    if (byEmail) {
      const ext = { ...((byEmail.external_ids as Record<string, unknown>) ?? {}), hubspot: id };
      await supabase.from("constituents").update({ external_ids: ext }).eq("id", byEmail.id);
      return { constituentId: byEmail.id };
    }
  }

  // 3. Create a person constituent from the mirror fields.
  const { data: created, error } = await supabase
    .from("constituents")
    .insert({
      org_id: orgId,
      type: "person",
      first_name: hs.first_name ?? null,
      last_name: hs.last_name ?? null,
      emails: email ? [email] : [],
      source: "hubspot_import",
      external_ids: { hubspot: id },
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[promoteHsContact] create failed:", error?.message);
    return { error: "Could not create constituent", status: 500 };
  }
  return { constituentId: created.id };
}
