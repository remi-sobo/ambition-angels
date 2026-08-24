import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireComms } from "@/lib/comms/stories-server";

/**
 * Fill one slot of an edition (spec §7.4).
 *
 * The consent boundary applies HERE as well as in the picker. A picker that
 * only shows publishable stories is an affordance; this is the check that
 * actually holds, because a story's consent can lapse between the moment it is
 * listed and the moment it is chosen — and because a request can be made
 * without the picker at all.
 *
 * The read goes to v_publishable_stories, the RLS-enforced view, not to
 * `stories` with a condition bolted on.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.slot_key !== "string" || !body.slot_key.trim()) {
    return NextResponse.json({ error: "Which slot?" }, { status: 400 });
  }
  const slotKey = body.slot_key.trim();

  const { data: edition } = await supabase
    .from("comms_editions")
    .select("id, status")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
  if (edition.status === "sent") {
    return NextResponse.json(
      { error: "This edition has already gone out. Its content is the record of what was sent." },
      { status: 409 },
    );
  }

  const update: Record<string, unknown> = {};

  if ("story_id" in body) {
    const v = body.story_id;
    if (v === null || v === "") {
      update.story_id = null;
    } else if (!isUuid(v)) {
      return NextResponse.json({ error: "Invalid story_id" }, { status: 400 });
    } else {
      const { data: story } = await supabase
        .from("v_publishable_stories")
        .select("id")
        .eq("id", v)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
      if (!story) {
        return NextResponse.json(
          {
            error:
              "That story can't be used yet. It needs to be approved, and everyone in it needs current consent.",
          },
          { status: 403 },
        );
      }
      update.story_id = v;
    }
  }

  if ("metric_ids" in body) {
    const raw = Array.isArray(body.metric_ids) ? body.metric_ids.filter(isUuid) : [];
    if (raw.length > 0) {
      // Only this org's metrics, proven by reading them through the session
      // client rather than trusting the ids.
      const { data: defs } = await supabase
        .from("metric_definitions")
        .select("id")
        .eq("org_id", ctx.orgId)
        .in("id", raw);
      const valid = new Set(((defs ?? []) as Array<{ id: string }>).map((d) => d.id));
      if (valid.size !== raw.length) {
        return NextResponse.json({ error: "One of those metrics wasn't found." }, { status: 404 });
      }
    }
    update.metric_ids = raw.length > 0 ? raw : null;
  }

  if ("content" in body) {
    const v = body.content;
    if (v === null || v === "") update.content = null;
    else if (typeof v === "string") update.content = v.slice(0, 20000);
    else return NextResponse.json({ error: "content must be text" }, { status: 400 });
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("comms_edition_slots")
    .update(update)
    .eq("edition_id", params.id)
    .eq("slot_key", slotKey)
    .eq("org_id", ctx.orgId)
    .select("id, slot_key, slot_def, story_id, metric_ids, content, position")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

  // Filling anything moves a planned edition into drafting, so the list stops
  // claiming it hasn't been started.
  if (edition.status === "planning") {
    await supabase
      .from("comms_editions")
      .update({ status: "drafting" })
      .eq("id", params.id)
      .eq("org_id", ctx.orgId);
  }

  await audit(req, {
    action: "comms.edition.slot_fill",
    entityType: "comms_edition",
    entityId: params.id,
    after: { slot_key: slotKey, fields: Object.keys(update) },
  });
  return NextResponse.json({ ok: true, slot: data });
}
