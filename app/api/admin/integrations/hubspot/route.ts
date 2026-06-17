import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// X7 — HubSpot connection management. `connections` is service-path only
// (RLS deny-all), so all reads/writes here go through the service-role client
// behind admin auth. "Connecting" enables the sync gates (an active row);
// the access token itself still comes from env until X8.

const FLAGS = ["sync_out", "sync_in", "sync_gifts_as_deals"] as const;
type Flag = (typeof FLAGS)[number];

async function readRow() {
  const { data } = await getSupabaseAdmin()
    .from("connections")
    .select("id, status, meta")
    .eq("provider", "hubspot")
    .limit(1)
    .maybeSingle();
  return data as { id: string; status: string; meta: Record<string, unknown> | null } | null;
}

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await readRow();
  const meta = (row?.meta ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    connected: row?.status === "active",
    tokenPresent: !!process.env.HUBSPOT_ACCESS_TOKEN,
    secretPresent: !!process.env.HUBSPOT_CLIENT_SECRET,
    flags: {
      sync_out: meta.sync_out === true,
      sync_in: meta.sync_in === true,
      sync_gifts_as_deals: meta.sync_gifts_as_deals === true,
    },
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const action = body.action;

  const admin = getSupabaseAdmin();
  const row = await readRow();

  if (action === "connect" || action === "disconnect") {
    const status = action === "connect" ? "active" : "revoked";
    if (row) {
      await admin.from("connections").update({ status }).eq("id", row.id);
    } else if (action === "connect") {
      await admin.from("connections").insert({ provider: "hubspot", status: "active", meta: {} });
    }
    await audit(req, { action: `fundraising.hubspot.${action}`, entityType: "connections", entityId: row?.id ?? null });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_flags") {
    if (!row) return NextResponse.json({ error: "Connect HubSpot first" }, { status: 400 });
    const meta = { ...((row.meta ?? {}) as Record<string, unknown>) };
    for (const f of FLAGS) {
      if (typeof body[f] === "boolean") meta[f as Flag] = body[f];
    }
    await admin.from("connections").update({ meta }).eq("id", row.id);
    await audit(req, { action: "fundraising.hubspot.set_flags", entityType: "connections", entityId: row.id, after: meta });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
