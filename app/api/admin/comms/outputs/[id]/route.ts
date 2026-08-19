import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireComms } from "@/lib/comms/stories-server";

/**
 * One composer draft: approve it, mark it used, discard it, or edit the text.
 *
 * `used_at` is stamped when the draft actually lands somewhere — an edition
 * slot in Phase 4, or a human saying so. Copying to the clipboard stamps
 * nothing, because we can't know what happened next and a false "used" would
 * quietly demote the story in the suggestion score.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

const STATUSES = ["draft", "approved", "used", "discarded"] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};

  if ("body" in body) {
    if (typeof body.body !== "string" || !body.body.trim()) {
      return NextResponse.json({ error: "The draft can't be empty." }, { status: 400 });
    }
    update.body = body.body.slice(0, 20000);
  }

  if ("status" in body) {
    if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    }
    update.status = body.status;
    if (body.status === "used") update.used_at = new Date().toISOString();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("comms_outputs")
    .update(update)
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select("id, story_id, channel, body, status, used_at, created_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  await audit(req, {
    action: `comms.output.${update.status ?? "edit"}`,
    entityType: "story",
    entityId: data.story_id as string,
    after: { output_id: data.id, channel: data.channel, status: data.status },
  });
  return NextResponse.json({ ok: true, output: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const { data: deleted, error } = await supabase
    .from("comms_outputs")
    .delete()
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select("story_id, channel");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (deleted ?? []) as Array<{ story_id: string; channel: string }>;
  if (rows.length === 0) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  await audit(req, {
    action: "comms.output.delete",
    entityType: "story",
    entityId: rows[0].story_id,
    before: { output_id: params.id, channel: rows[0].channel },
  });
  return NextResponse.json({ ok: true });
}
