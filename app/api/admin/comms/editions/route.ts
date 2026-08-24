import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireComms } from "@/lib/comms/stories-server";
import { createEdition, loadEditions } from "@/lib/comms/editions-server";
import { editionTitleFor, planDates, type Cadence } from "@/lib/comms/formats";

/**
 * Editions (spec §7.4).
 *
 * POST creates one edition, or — with `plan_year` — the whole cadence up
 * front. Planning the year is the point: the deadlines exist months out, so
 * nothing gets written the week it is due.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function GET() {
  const g = await requireComms();
  if (!g.ok) return g.res;
  const editions = await loadEditions(g.supabase, g.ctx.orgId);
  return NextResponse.json({ editions });
}

export async function POST(req: NextRequest) {
  const g = await requireComms();
  if (!g.ok) return g.res;
  const { ctx, supabase } = g;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isUuid(body.format_id)) {
    return NextResponse.json({ error: "Pick a format." }, { status: 400 });
  }

  const { data: format } = await supabase
    .from("comms_formats")
    .select("id, name, cadence")
    .eq("id", body.format_id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!format) return NextResponse.json({ error: "Format not found" }, { status: 404 });
  const fmt = format as { id: string; name: string; cadence: Cadence };

  // ── Plan the year ────────────────────────────────────────────────────────
  if (body.plan_year === true) {
    const from = isISODate(body.from) ? body.from : new Date().toISOString().slice(0, 10);
    const dates = planDates(fmt.cadence, from);
    if (dates.length === 0) {
      return NextResponse.json(
        { error: "An ad-hoc format has no schedule to plan — create these one at a time." },
        { status: 400 },
      );
    }

    // Don't duplicate a date this format already has planned; running "plan
    // the year" twice should be a no-op, not a second set of deadlines.
    const { data: existing } = await supabase
      .from("comms_editions")
      .select("target_date")
      .eq("org_id", ctx.orgId)
      .eq("format_id", fmt.id)
      .in("target_date", dates);
    const taken = new Set(
      ((existing ?? []) as Array<{ target_date: string }>).map((r) => r.target_date),
    );

    const created: string[] = [];
    for (const date of dates) {
      if (taken.has(date)) continue;
      const res = await createEdition(supabase, ctx.orgId, {
        formatId: fmt.id,
        title: editionTitleFor(fmt.name, date),
        targetDate: date,
      });
      if ("error" in res) {
        return NextResponse.json({ error: res.error }, { status: 500 });
      }
      created.push(res.id);
    }

    await audit(req, {
      action: "comms.edition.plan_year",
      entityType: "comms_format",
      entityId: fmt.id,
      after: { cadence: fmt.cadence, created: created.length, skipped: dates.length - created.length },
    });
    return NextResponse.json({ ok: true, created: created.length, skipped: dates.length - created.length });
  }

  // ── One edition ──────────────────────────────────────────────────────────
  const target = isISODate(body.target_date) ? body.target_date : null;
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 200)
      : editionTitleFor(fmt.name, target ?? new Date().toISOString().slice(0, 10));

  const res = await createEdition(supabase, ctx.orgId, {
    formatId: fmt.id,
    title,
    targetDate: target,
    subject: typeof body.subject === "string" ? body.subject.trim().slice(0, 200) : null,
  });
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });

  await audit(req, {
    action: "comms.edition.create",
    entityType: "comms_edition",
    entityId: res.id,
    after: { title, format: fmt.name, target_date: target },
  });
  return NextResponse.json({ ok: true, id: res.id });
}
