import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { resolveRecipients, parseSegmentDefinition } from "@/lib/fundraising/segments";
import { constituentName } from "@/lib/fundraising/display";
import { MAX_RECIPIENTS } from "@/lib/comms/queue-plan";

/**
 * The list builder's live view (specs/comms-v3-composer.md): who is on a
 * list right now, one page at a time, with who is left out and why. It runs
 * the send path's own resolver, so the people shown are the people an email
 * to this list would reach. Read-only; nothing is saved or queued.
 */

const PAGE_SIZE = 25;

export async function POST(req: NextRequest) {
  const gate = await requirePermission("fundraising.read", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const orgId = gate.ctx.orgId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const supabase = createServerSupabase();
  const definition = body.definition ?? {};
  const r = await resolveRecipients(supabase, definition, orgId);

  const find = typeof body.find === "string" ? body.find.trim().toLowerCase().slice(0, 80) : "";
  const matching = find
    ? r.recipients.filter((p) => p.name.toLowerCase().includes(find) || p.email.toLowerCase().includes(find))
    : r.recipients;
  const sorted = [...matching].sort((a, b) => a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(Math.max(0, Number(body.page) || 0), pages - 1);

  // Names for the people taken off by hand, so they can be put back.
  const parsed = parseSegmentDefinition(definition);
  const removedIds = parsed.ok ? (parsed.def.exclude_ids ?? []).slice(0, 200) : [];
  let removed: Array<{ id: string; name: string }> = [];
  if (removedIds.length) {
    const { data } = await supabase
      .from("v_fr_rollups")
      .select("id, type, first_name, last_name, org_name")
      .eq("org_id", orgId)
      .in("id", removedIds);
    removed = ((data ?? []) as Array<{ id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null }>).map(
      (c) => ({ id: c.id, name: constituentName(c) })
    );
  }

  return NextResponse.json({
    recipients: r.recipients.length,
    excluded: r.excluded,
    error: r.error ?? null,
    max_recipients: MAX_RECIPIENTS,
    no_first_name: r.recipients.filter((p) => !p.firstName.trim()).length,
    matching: sorted.length,
    page,
    pages,
    people: sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      last_gift: p.lastGift,
      lifetime_total: p.lifetimeTotal,
      added: !!p.added,
    })),
    removed,
  });
}
