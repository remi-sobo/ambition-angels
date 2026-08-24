import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireComms } from "@/lib/comms/stories-server";
import { loadEdition } from "@/lib/comms/editions-server";
import { isEditionStatus } from "@/lib/comms/formats";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const detail = await loadEdition(g.supabase, g.ctx.orgId, params.id);
  if (!detail) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if ("title" in body) {
    const v = typeof body.title === "string" ? body.title.trim() : "";
    if (!v) return NextResponse.json({ error: "An edition needs a title." }, { status: 400 });
    update.title = v.slice(0, 200);
  }
  if ("subject" in body) {
    const v = body.subject;
    update.subject = typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null;
  }
  if ("target_date" in body) {
    const v = body.target_date;
    if (v === null || v === "") update.target_date = null;
    else if (isISODate(v)) update.target_date = v;
    else return NextResponse.json({ error: "target_date must be YYYY-MM-DD" }, { status: 400 });
  }
  if ("status" in body) {
    if (!isEditionStatus(body.status)) {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    }
    // `compiled` and `sent` are set by the compile/send path, not by hand —
    // letting the UI claim them would make the campaign linkage a lie.
    if (body.status === "compiled" || body.status === "sent") {
      return NextResponse.json(
        { error: "That status is set by compiling and sending, not directly." },
        { status: 400 },
      );
    }
    update.status = body.status;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("comms_editions")
    .update(update)
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .select("id, title, subject, status, target_date")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Edition not found" }, { status: 404 });

  await audit(req, {
    action: "comms.edition.update",
    entityType: "comms_edition",
    entityId: params.id,
    after: update,
  });
  return NextResponse.json({ ok: true, edition: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  // A sent edition is a record of what went out. It archives; it never deletes.
  const { data: current } = await supabase
    .from("comms_editions")
    .select("status, title")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
  if (current.status === "sent") {
    return NextResponse.json(
      { error: "A sent edition can't be deleted — archive it instead." },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("comms_editions")
    .delete()
    .eq("id", params.id)
    .eq("org_id", ctx.orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "comms.edition.delete",
    entityType: "comms_edition",
    entityId: params.id,
    before: { title: current.title },
  });
  return NextResponse.json({ ok: true });
}
