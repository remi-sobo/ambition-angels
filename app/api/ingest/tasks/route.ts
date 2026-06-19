import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ingestTask, type IngestResult } from "@/lib/admin/ops/ingest";

/**
 * Machine-to-machine task ingest (BloomOS) — HTTP variant.
 *
 * Lets an outside agent (e.g. Shannon's Claude Cowork morning run) seed tasks
 * into BloomOS via a plain HTTP POST. Bearer-token auth (TASK_INGEST_SECRET),
 * the same pattern the cron routes use. The dedupe + insert logic is shared
 * with the MCP connector (lib/admin/ops/ingest.ts).
 *
 * Body: a single task object, or { tasks: [ ...up to 100 ] }.
 */
const MAX_BATCH = 100;
type IngestTask = Record<string, unknown>;

export async function POST(req: NextRequest) {
  const secret = process.env.TASK_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Task ingest is not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as IngestTask | { tasks?: IngestTask[] } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const items: IngestTask[] = Array.isArray((body as { tasks?: IngestTask[] }).tasks)
    ? (body as { tasks: IngestTask[] }).tasks
    : [body as IngestTask];
  if (items.length === 0) {
    return NextResponse.json({ error: "No tasks provided" }, { status: 400 });
  }
  if (items.length > MAX_BATCH) {
    return NextResponse.json({ error: `Too many tasks (max ${MAX_BATCH})` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const results: IngestResult[] = [];
  for (const t of items) results.push(await ingestTask(supabase, req, t, "ingest"));

  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;
  return NextResponse.json({ ok: errors === 0, created, skipped, errors, results });
}
