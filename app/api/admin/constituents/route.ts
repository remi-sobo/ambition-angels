import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Epic B — constituent (donor) records by hand. Until now constituents were
// only created as a side effect of a gift/opportunity/grant; this lets staff
// add and maintain donor records directly.

const strArr = (v: unknown): string[] | undefined =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean)
    : undefined;
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/**
 * POST /api/admin/constituents — create a donor record.
 * A person needs a first or last name; an organization needs org_name.
 */
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const type = body.type === "organization" ? "organization" : "person";
  const insert: Record<string, unknown> = { type, source: "manual" };

  if (type === "organization") {
    const orgName = str(body.org_name);
    if (!orgName) return NextResponse.json({ error: "org_name is required" }, { status: 400 });
    insert.org_name = orgName;
  } else {
    const first = str(body.first_name);
    const last = str(body.last_name);
    if (!first && !last) {
      return NextResponse.json({ error: "first or last name is required" }, { status: 400 });
    }
    if (first) insert.first_name = first;
    if (last) insert.last_name = last;
  }

  const emails = strArr(body.emails);
  if (emails) insert.emails = emails;
  const phones = strArr(body.phones);
  if (phones) insert.phones = phones;
  const tags = strArr(body.tags);
  if (tags) insert.tags = tags;
  for (const f of ["street", "city", "state", "postal_code", "notes"] as const) {
    const v = str(body[f]);
    if (v) insert[f] = v;
  }
  if (typeof body.do_not_contact === "boolean") insert.do_not_contact = body.do_not_contact;

  const supabase = createServerSupabase();
  const { data, error } = await supabase.from("constituents").insert(insert).select("id").single();
  if (error || !data) {
    console.error("[constituents] create failed:", error?.message);
    return NextResponse.json({ error: "Could not create constituent" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.constituent.create",
    entityType: "constituents",
    entityId: data.id,
    after: insert,
  });

  return NextResponse.json({ id: data.id });
}
