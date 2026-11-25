import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { resolveRecipients } from "@/lib/fundraising/segments";
import { normalizeTags, TAGS_PER_CHANGE } from "@/lib/comms/tags";
import { applyTags, emailsIn, loadTagOverview, matchEmails } from "@/lib/admin/tags-server";

/**
 * Tags on people.
 *
 *   GET   the tag library: every tag in use with its count, plus what
 *         BloomOS works out by itself (Donor, Lapsed, Recurring, Never gave)
 *   POST  add and remove tags on a group of people, named one of three ways:
 *           { ids }         these people
 *           { definition }  everyone on this list (including people who
 *                           can't be emailed: a tag is about who they are)
 *           { emails }      pasted addresses, matched to people in BloomOS
 *
 * Pinned to the active org. Writing needs fundraising.write.
 */

// Bulk tagging is sequential writes; give a big list room to finish.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PEOPLE = 10_000;
const MAX_PASTED = 5000;

export async function GET() {
  const gate = await requirePermission("fundraising.read");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  return NextResponse.json(await loadTagOverview(createServerSupabase(), gate.ctx.orgId));
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission("fundraising.write");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const orgId = gate.ctx.orgId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const add = normalizeTags(body.add);
  const remove = normalizeTags(body.remove);
  if (add.length === 0 && remove.length === 0) return NextResponse.json({ error: "Name the tag to add or remove." }, { status: 400 });
  if ((Array.isArray(body.add) && body.add.length > TAGS_PER_CHANGE) || (Array.isArray(body.remove) && body.remove.length > TAGS_PER_CHANGE)) {
    return NextResponse.json({ error: `Up to ${TAGS_PER_CHANGE} tags at a time.` }, { status: 400 });
  }

  const supabase = createServerSupabase();
  let ids: string[] = [];
  let unmatched: string[] = [];

  if (Array.isArray(body.ids)) {
    if (body.ids.some((v) => typeof v !== "string" || !UUID.test(v))) return NextResponse.json({ error: "Those people are not readable." }, { status: 400 });
    ids = body.ids as string[];
  } else if (typeof body.emails === "string") {
    const found = emailsIn(body.emails);
    if (found.length === 0) return NextResponse.json({ error: "No email addresses found in what you pasted." }, { status: 400 });
    if (found.length > MAX_PASTED) return NextResponse.json({ error: `Paste up to ${MAX_PASTED.toLocaleString("en-US")} addresses at a time.` }, { status: 400 });
    const m = await matchEmails(supabase, orgId, found);
    if (m.error) return NextResponse.json({ error: "Couldn't read your people just now." }, { status: 500 });
    ids = m.matched.map((p) => p.id);
    unmatched = m.unmatched;
  } else if (body.definition && typeof body.definition === "object" && !Array.isArray(body.definition)) {
    const r = await resolveRecipients(supabase, body.definition, orgId);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    ids = r.memberIds ?? [];
  } else {
    return NextResponse.json({ error: "Say who to tag." }, { status: 400 });
  }

  if (ids.length > MAX_PEOPLE) return NextResponse.json({ error: `That is ${ids.length.toLocaleString("en-US")} people. Tag up to ${MAX_PEOPLE.toLocaleString("en-US")} at a time.` }, { status: 400 });
  if (ids.length === 0) return NextResponse.json({ people: 0, changed: 0, unmatched });

  const result = await applyTags(supabase, orgId, ids, add, remove);
  if (result.error) {
    console.error("[tags] apply failed:", result.error);
    return NextResponse.json({ error: "Couldn't save the tags. Some people may have been tagged; try again." }, { status: 500 });
  }
  await audit(req, {
    action: "fundraising.tags.apply",
    entityType: "constituents",
    after: { add, remove, people: result.people, changed: result.changed },
  });
  return NextResponse.json({ people: result.people, changed: result.changed, unmatched });
}
