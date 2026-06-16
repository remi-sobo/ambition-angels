import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { pushInteractionToHubSpot } from "@/lib/hubspot/sync-out";

// Epic B — log a touch (call/email/meeting/event/note) against a donor. Feeds
// the Interactions timeline on the donor profile.

const KINDS = ["call", "email", "meeting", "event", "note"] as const;
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
// Accept a date (YYYY-MM-DD) or a datetime-local / ISO string; Postgres
// timestamptz parses all of these.
const isWhen = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(v);

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  if (!isUuid(body.constituent_id)) {
    return NextResponse.json({ error: "constituent_id is required" }, { status: 400 });
  }
  if (!KINDS.includes(body.kind as (typeof KINDS)[number])) {
    return NextResponse.json({ error: "kind must be call/email/meeting/event/note" }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    constituent_id: body.constituent_id,
    kind: body.kind,
    logged_by: (await getAdminUser()) ?? null,
  };
  if (isWhen(body.occurred_at)) insert.occurred_at = body.occurred_at;
  if (typeof body.notes === "string" && body.notes.trim()) insert.notes = body.notes.slice(0, 4000);

  const supabase = createServerSupabase();
  const { data, error } = await supabase.from("interactions").insert(insert).select("id").single();
  if (error || !data) {
    console.error("[interactions] create failed:", error?.message);
    return NextResponse.json({ error: "Could not log interaction" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.interaction.create",
    entityType: "interactions",
    entityId: data.id,
    after: insert,
  });

  // Mirror to a connected HubSpot as an engagement (no-op when standalone).
  await pushInteractionToHubSpot(data.id);

  return NextResponse.json({ id: data.id });
}
