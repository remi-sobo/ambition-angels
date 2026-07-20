import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-grant contacts (grant_contacts): the PEOPLE attached to a grant pursuit,
 * CRM-deal style. The funder itself stays on grants.funder_id (an organization
 * constituent); these rows link person constituents — intro source, program
 * officer, finance/reporting — each tagged with a role, at most one primary
 * per grant (partial unique index grant_contacts_one_primary_idx).
 *
 * Callers pass the *authenticated* server client so grant_contacts RLS
 * (has_permission(org_id,'fundraising.read'/'write')) governs every query —
 * nothing here bypasses RLS.
 */

/** Suggested roles the UI seeds. The column is free text on purpose. */
export const GRANT_CONTACT_ROLES = [
  ["intro_source", "Intro source"],
  ["program_officer", "Program officer"],
  ["primary", "Primary contact"],
  ["finance_reporting", "Finance / reporting"],
  ["other", "Other"],
] as const;

export const GRANT_CONTACT_ROLE_LABELS: Record<string, string> =
  Object.fromEntries(GRANT_CONTACT_ROLES);

export type GrantContactConstituent = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  emails: string[] | null;
};

export type GrantContact = {
  id: string;
  org_id: string;
  grant_id: string;
  constituent_id: string;
  role: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  constituent: GrantContactConstituent | null;
};

/** The embed used everywhere a contact renders (name + email in one fetch). */
const CONTACT_SELECT =
  "*, constituent:constituents(id, type, first_name, last_name, org_name, emails)";

/**
 * All contacts on a grant, primary first, then oldest link first. Returns the
 * joined constituent so the UI renders name/email without a second fetch.
 */
export async function listGrantContacts(
  supabase: SupabaseClient,
  grantId: string
): Promise<{ contacts: GrantContact[] } | { error: string }> {
  const { data, error } = await supabase
    .from("grant_contacts")
    .select(CONTACT_SELECT)
    .eq("grant_id", grantId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return { error: error.message };
  return { contacts: (data ?? []) as unknown as GrantContact[] };
}

/**
 * Attach a person constituent to a grant. The first contact on a grant becomes
 * primary automatically (mirrors partner_contacts); an explicit primary
 * demotes the current one first. Races resolve at the DB: the partial unique
 * index allows only one primary, and (grant_id, constituent_id) is unique, so
 * a duplicate link comes back as a friendly error instead of a second row.
 */
export async function addGrantContact(
  supabase: SupabaseClient,
  orgId: string,
  args: {
    grantId: string;
    constituentId: string;
    role?: string | null;
    isPrimary?: boolean;
    notes?: string | null;
  }
): Promise<{ contact: GrantContact } | { error: string; status?: number }> {
  let isPrimary = args.isPrimary === true;

  if (isPrimary) {
    const cleared = await clearPrimary(supabase, args.grantId);
    if (cleared.error) return { error: cleared.error };
  } else {
    const { count } = await supabase
      .from("grant_contacts")
      .select("id", { count: "exact", head: true })
      .eq("grant_id", args.grantId);
    if ((count ?? 0) === 0) isPrimary = true;
  }

  const { data, error } = await supabase
    .from("grant_contacts")
    .insert({
      org_id: orgId,
      grant_id: args.grantId,
      constituent_id: args.constituentId,
      role: args.role?.trim() || null,
      is_primary: isPrimary,
      notes: args.notes?.trim() || null,
    })
    .select(CONTACT_SELECT)
    .single();
  if (error) {
    if (error.code === "23505") {
      return { error: "That person is already a contact on this grant.", status: 409 };
    }
    if (error.code === "23503") {
      return { error: "Grant or constituent not found.", status: 404 };
    }
    return { error: error.message };
  }
  return { contact: data as unknown as GrantContact };
}

/**
 * Edit a contact link's role / notes / primary flag. Setting is_primary=true
 * routes through setPrimaryGrantContact so the old primary is demoted first.
 */
export async function updateGrantContact(
  supabase: SupabaseClient,
  contactId: string,
  patch: { role?: string | null; isPrimary?: boolean; notes?: string | null }
): Promise<{ contact: GrantContact } | { error: string; status?: number }> {
  if (patch.isPrimary === true) {
    const { data: row } = await supabase
      .from("grant_contacts")
      .select("grant_id")
      .eq("id", contactId)
      .maybeSingle();
    if (!row) return { error: "Contact not found.", status: 404 };
    const swapped = await setPrimaryGrantContact(supabase, row.grant_id, contactId);
    if ("error" in swapped) return swapped;
  }

  const update: Record<string, unknown> = {};
  if ("role" in patch) update.role = patch.role?.trim() || null;
  if ("notes" in patch) update.notes = patch.notes?.trim() || null;
  if (patch.isPrimary === false) update.is_primary = false;

  if (Object.keys(update).length === 0) {
    // Primary-only change: re-read for the caller.
    const { data, error } = await supabase
      .from("grant_contacts")
      .select(CONTACT_SELECT)
      .eq("id", contactId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: "Contact not found.", status: 404 };
    return { contact: data as unknown as GrantContact };
  }

  const { data, error } = await supabase
    .from("grant_contacts")
    .update(update)
    .eq("id", contactId)
    .select(CONTACT_SELECT)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Contact not found.", status: 404 };
  return { contact: data as unknown as GrantContact };
}

/** Unlink a contact from its grant. The constituent record is never deleted. */
export async function removeGrantContact(
  supabase: SupabaseClient,
  contactId: string
): Promise<{ removed: boolean } | { error: string }> {
  const { data, error } = await supabase
    .from("grant_contacts")
    .delete()
    .eq("id", contactId)
    .select("id");
  if (error) return { error: error.message };
  return { removed: (data ?? []).length > 0 };
}

/**
 * Make one contact the grant's primary: demote the current primary, then
 * promote the target. supabase-js has no client-side transactions; the partial
 * unique index is the invariant's real enforcement, so a lost race surfaces as
 * a unique violation (retryable) rather than two primaries.
 */
export async function setPrimaryGrantContact(
  supabase: SupabaseClient,
  grantId: string,
  contactId: string
): Promise<{ ok: true } | { error: string; status?: number }> {
  const cleared = await clearPrimary(supabase, grantId, contactId);
  if (cleared.error) return { error: cleared.error };

  const { data, error } = await supabase
    .from("grant_contacts")
    .update({ is_primary: true })
    .eq("id", contactId)
    .eq("grant_id", grantId)
    .select("id");
  if (error) {
    if (error.code === "23505") {
      return { error: "Another contact was just made primary — try again." };
    }
    return { error: error.message };
  }
  if ((data ?? []).length === 0) return { error: "Contact not found.", status: 404 };
  return { ok: true };
}

/** Demote the grant's current primary (optionally sparing one contact). */
async function clearPrimary(
  supabase: SupabaseClient,
  grantId: string,
  exceptContactId?: string
): Promise<{ error?: string }> {
  let q = supabase
    .from("grant_contacts")
    .update({ is_primary: false })
    .eq("grant_id", grantId)
    .eq("is_primary", true);
  if (exceptContactId) q = q.neq("id", exceptContactId);
  const { error } = await q;
  return error ? { error: error.message } : {};
}

/**
 * Resolve a person for "add contact with a brand-new person": match an
 * existing person constituent by email first (keeps the CRM deduped — the
 * same reason FunderPicker prefers picking over free-texting), else create
 * one. Mirrors findOrCreateFunder in lib/fundraising/grants.ts.
 */
export async function findOrCreatePersonContact(
  supabase: SupabaseClient,
  orgId: string,
  person: { firstName: string; lastName?: string; email?: string }
): Promise<{ id: string } | { error: string }> {
  const email = person.email?.trim().toLowerCase();
  if (email) {
    const { data: existing } = await supabase
      .from("constituents")
      .select("id")
      .eq("type", "person")
      .contains("emails", [email])
      .limit(1)
      .maybeSingle();
    if (existing) return { id: existing.id };
  }

  const { data: created, error } = await supabase
    .from("constituents")
    .insert({
      org_id: orgId,
      type: "person",
      first_name: person.firstName.trim(),
      last_name: person.lastName?.trim() || null,
      emails: email ? [email] : [],
      source: "manual",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: created.id };
}
