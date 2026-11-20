import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { pushConstituentToHubSpot } from "@/lib/hubspot/sync-out";
import { isCompanyStage, normalizeDomains } from "@/lib/fundraising/company-stages";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const strArr = (v: unknown): string[] | undefined =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean)
    : undefined;

// PATCH /api/admin/constituents/[id] — edit a donor record. Partial: only the
// fields present in the body change. Arrays (emails/phones/tags) replace.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.type === "person" || body.type === "organization") update.type = body.type;
  // why_matters is the Donor 360 narrative (Spec Fundraising decision 1,
  // signed): HUMAN-written through this route only. Reed may draft into
  // reed_drafts for approval but never writes the column.
  for (const f of ["first_name", "last_name", "org_name", "street", "city", "state", "postal_code", "notes", "why_matters"] as const) {
    if (typeof body[f] === "string") update[f] = (body[f] as string).trim() || null;
  }
  const emails = strArr(body.emails);
  if (emails) update.emails = emails;
  const phones = strArr(body.phones);
  if (phones) update.phones = phones;
  const tags = strArr(body.tags);
  if (tags) update.tags = tags;
  if (typeof body.do_not_contact === "boolean") update.do_not_contact = body.do_not_contact;
  // Volunteer (Leader) flag — flag/unflag from the Volunteers list.
  if (typeof body.is_volunteer === "boolean") update.is_volunteer = body.is_volunteer;
  // Preferred stewardship channel: one of the ack channels, or null to clear.
  if (body.preferred_ack_channel === null) update.preferred_ack_channel = null;
  else if (
    typeof body.preferred_ack_channel === "string" &&
    ["email", "letter", "call", "text", "in_person"].includes(body.preferred_ack_channel)
  )
    update.preferred_ack_channel = body.preferred_ack_channel;
  // Soft archive: hide from working lists/queues while keeping all history.
  if (typeof body.archived === "boolean")
    update.archived_at = body.archived ? new Date().toISOString() : null;
  // Household membership: a uuid joins, explicit null leaves.
  if (isUuid(body.household_id)) update.household_id = body.household_id;
  else if (body.household_id === null) update.household_id = null;

  // Company stage (specs/bloomos-companies.md): a stage key marks an
  // organization as a company, explicit null stops tracking it. Organizations
  // only; the database enforces the same rule.
  if (body.company_stage === null) update.company_stage = null;
  else if (body.company_stage !== undefined) {
    if (!isCompanyStage(body.company_stage)) {
      return NextResponse.json({ error: "Unknown company stage" }, { status: 400 });
    }
    update.company_stage = body.company_stage;
  }
  // Email domains for intake matching. The list replaces; every entry must
  // read as a domain, so a typo fails loudly instead of matching nothing.
  if (body.domains !== undefined) {
    if (!Array.isArray(body.domains)) {
      return NextResponse.json({ error: "domains must be a list" }, { status: 400 });
    }
    const { domains, invalid } = normalizeDomains(body.domains.filter((d): d is string => typeof d === "string"));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Not a domain: ${invalid.join(", ")}` }, { status: 400 });
    }
    update.domains = domains;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  if (typeof update.company_stage === "string") {
    const { data: row } = await supabase.from("constituents").select("type").eq("id", params.id).maybeSingle();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (row.type !== "organization" && update.type !== "organization") {
      return NextResponse.json({ error: "Only an organization can have a company stage" }, { status: 400 });
    }
  }
  const { error } = await supabase.from("constituents").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.constituent.update",
    entityType: "constituents",
    entityId: params.id,
    after: update,
  });

  // Outbound sync to a connected HubSpot (no-op when standalone). Company
  // stage and domains are BloomOS-only (no HubSpot write-back, spec scope),
  // so an edit that touches only those skips the push.
  const companyOnly = Object.keys(update).every((k) => k === "company_stage" || k === "domains");
  if (!companyOnly) await pushConstituentToHubSpot(params.id);

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/constituents/[id] — hard delete, allowed ONLY for records
// with no financial footprint (no gifts, no grants as funder). Those have
// gifts ON DELETE SET NULL, so deleting would orphan giving as anonymous — for
// them the caller must archive or merge instead (409). Opportunities,
// interactions, soft credits cascade away cleanly.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = createServerSupabase();
  const [giftsCount, grantsCount] = await Promise.all([
    supabase.from("gifts").select("id", { count: "exact", head: true }).eq("constituent_id", params.id),
    supabase.from("grants").select("id", { count: "exact", head: true }).eq("funder_id", params.id),
  ]);
  const gifts = giftsCount.count ?? 0;
  const grants = grantsCount.count ?? 0;
  if (gifts > 0 || grants > 0) {
    return NextResponse.json(
      {
        error: "Has financial history — archive or merge instead of deleting.",
        gift_count: gifts,
        grant_count: grants,
      },
      { status: 409 }
    );
  }

  const { data: before } = await supabase
    .from("constituents")
    .select("id, first_name, last_name, org_name, type")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("constituents").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.constituent.delete",
    entityType: "constituents",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
