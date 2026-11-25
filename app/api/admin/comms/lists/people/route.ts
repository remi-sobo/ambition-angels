import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { constituentName } from "@/lib/fundraising/display";
import { sanitizeQuery } from "@/lib/fundraising/views";
import { emailsIn, matchEmails } from "@/lib/admin/tags-server";

/**
 * Finding people to put on a list by hand (specs/comms-v3-composer.md).
 *
 *   GET  ?q=        search this org's people by name, or by a whole address
 *   POST { emails } match pasted addresses to people already in BloomOS
 *
 * Both are read-only and pinned to the active org. A pasted address that
 * matches nobody is reported back, never created: a list only ever holds
 * people BloomOS already knows, so unsubscribes and do-not-contact apply.
 */

type Row = { id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null; emails: string[] | null };
const COLUMNS = "id, type, first_name, last_name, org_name, emails";
const MAX_PASTED = 2000;
const isEmail = (v: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v);

const shape = (c: Row) => ({ id: c.id, name: constituentName(c), email: (c.emails ?? [])[0] ?? null });

export async function GET(req: NextRequest) {
  const gate = await requirePermission("fundraising.read", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const raw = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (raw.length < 2) return NextResponse.json({ people: [] });

  const supabase = createServerSupabase();
  let query = supabase.from("v_fr_rollups").select(COLUMNS).eq("org_id", gate.ctx.orgId).is("archived_at", null);
  if (isEmail(raw)) {
    query = query.contains("emails", [raw.toLowerCase()]);
  } else {
    const q = sanitizeQuery(raw);
    if (!q) return NextResponse.json({ people: [] });
    // "Ana Lopez" should find first name Ana, last name Lopez.
    const [first, ...rest] = q.split(" ");
    const last = rest.join(" ");
    // ...and "Acme Foundation" should still find the organization.
    query = last
      ? query.or(`and(first_name.ilike.%${first}%,last_name.ilike.%${last}%),org_name.ilike.%${q}%`)
      : query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,org_name.ilike.%${q}%`);
  }
  const { data, error } = await query.order("last_name").limit(8);
  if (error) return NextResponse.json({ error: "Couldn't search just now." }, { status: 500 });
  return NextResponse.json({ people: ((data ?? []) as Row[]).map(shape) });
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission("fundraising.read", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const text = typeof body?.emails === "string" ? body.emails : "";
  const found = emailsIn(text);
  if (found.length === 0) return NextResponse.json({ error: "No email addresses found in what you pasted." }, { status: 400 });
  if (found.length > MAX_PASTED) {
    return NextResponse.json({ error: `That is ${found.length.toLocaleString("en-US")} addresses. Paste up to ${MAX_PASTED.toLocaleString("en-US")} at a time.` }, { status: 400 });
  }
  const r = await matchEmails(createServerSupabase(), gate.ctx.orgId, found);
  if (r.error) return NextResponse.json({ error: "Couldn't read your people just now." }, { status: 500 });
  return NextResponse.json({ matched: r.matched, unmatched: r.unmatched });
}
