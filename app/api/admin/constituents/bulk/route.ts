/**
 * POST /api/admin/constituents/bulk — bulk archive / unarchive / delete from the
 * Donors and Prospects lists. Delete carries the same guard as the single
 * route: a constituent with gifts or grants is never hard-deleted (it would
 * orphan giving as anonymous) — those are reported back as skipped so the UI
 * can tell the operator to archive them instead.
 *
 * Body: { ids: string[], action: "archive" | "unarchive" | "delete" }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { ids?: unknown; action?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body!.ids.filter(isUuid).slice(0, 500) : [];
  const action = body?.action;
  if (ids.length === 0) return NextResponse.json({ error: "No valid ids" }, { status: 400 });
  if (action !== "archive" && action !== "unarchive" && action !== "delete") {
    return NextResponse.json({ error: "action must be archive | unarchive | delete" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  if (action === "archive" || action === "unarchive") {
    const archived_at = action === "archive" ? new Date().toISOString() : null;
    const { error } = await supabase.from("constituents").update({ archived_at }).in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await audit(req, { action: `fundraising.constituent.${action}`, entityType: "constituents", after: { ids } });
    return NextResponse.json({ ok: true, updated: ids.length });
  }

  // delete — skip anyone with financial history.
  const [giftsRes, grantsRes] = await Promise.all([
    supabase.from("gifts").select("constituent_id").in("constituent_id", ids),
    supabase.from("grants").select("funder_id").in("funder_id", ids),
  ]);
  const blocked = new Set<string>();
  for (const r of (giftsRes.data ?? []) as { constituent_id: string | null }[]) if (r.constituent_id) blocked.add(r.constituent_id);
  for (const r of (grantsRes.data ?? []) as { funder_id: string | null }[]) if (r.funder_id) blocked.add(r.funder_id);

  const deletable = ids.filter((id) => !blocked.has(id));
  if (deletable.length > 0) {
    const { error } = await supabase.from("constituents").delete().in("id", deletable);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await audit(req, {
      action: "fundraising.constituent.delete",
      entityType: "constituents",
      after: { ids: deletable, count: deletable.length },
    });
  }
  return NextResponse.json({
    ok: true,
    deleted: deletable.length,
    skipped: ids.length - deletable.length,
    skipped_ids: Array.from(blocked).filter((id) => ids.includes(id)),
  });
}
