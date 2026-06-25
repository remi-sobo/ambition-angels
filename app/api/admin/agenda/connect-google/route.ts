/**
 * One-time / re-consent: store the signed-in user's Google Calendar refresh
 * token in the encrypted `connections` store (BloomOS Agenda Phase 2 credential
 * migration). For AA this migrates the env GOOGLE_REFRESH_TOKEN off env and onto
 * a per-user connection so a second tenant doesn't depend on it.
 *
 * Owner/admin only. By default it adopts the env GOOGLE_REFRESH_TOKEN; a token
 * can also be supplied in the body (a fresh per-user consent). Idempotent —
 * re-running rotates the stored token.
 */
import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { isTokenEncConfigured } from "@/lib/crypto/secret-box";
import { upsertGoogleCalendarConnection } from "@/lib/google/connection";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Owner or admin only" }, { status: 403 });
  }
  if (!isTokenEncConfigured()) {
    return NextResponse.json(
      { error: "BLOOMOS_TOKEN_ENC_KEY is not set (base64 of `openssl rand -base64 32`)" },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const suppliedToken = typeof body?.refreshToken === "string" ? body.refreshToken.trim() : "";
  const calendarId = typeof body?.calendarId === "string" && body.calendarId.trim()
    ? body.calendarId.trim()
    : (process.env.GOOGLE_CALENDAR_ID || "primary");

  const refreshToken = suppliedToken || process.env.GOOGLE_REFRESH_TOKEN || "";
  if (!refreshToken) {
    return NextResponse.json(
      { error: "No refresh token: supply { refreshToken } or set GOOGLE_REFRESH_TOKEN" },
      { status: 400 }
    );
  }

  try {
    await upsertGoogleCalendarConnection({
      orgId: ctx.orgId,
      userId: ctx.userId,
      refreshToken,
      calendarId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("connect-google failed:", message);
    return NextResponse.json({ error: "Couldn't store the calendar connection" }, { status: 500 });
  }

  await audit(req, {
    action: "agenda.calendar_connected",
    entityType: "connection",
    entityId: null,
    after: { provider: "google_calendar", calendar_id: calendarId, source: suppliedToken ? "supplied" : "env" },
  });
  return NextResponse.json({ ok: true, calendarId });
}
