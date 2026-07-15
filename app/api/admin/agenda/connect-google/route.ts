/**
 * Finalize the Google Calendar connect flow: turn the user's staged `pending`
 * account (created by ../callback after the OAuth account chooser) into one
 * active connection per selected calendar. Selections are validated against
 * the account's real calendar list — the client can't connect an arbitrary id.
 *
 * The old behavior of adopting the env GOOGLE_REFRESH_TOKEN (which silently
 * connected remi@ambitionangels.org for whoever clicked Connect) is gone; the
 * only way in is the per-user OAuth consent at ./start.
 *
 * DELETE discards the staged account without connecting anything.
 */
import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { isTokenEncConfigured } from "@/lib/crypto/secret-box";
import {
  getPendingGoogleAccount,
  deletePendingGoogleAccount,
  upsertGoogleCalendarConnection,
} from "@/lib/google/connection";
import { listAccountCalendars } from "@/lib/google/oauth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isTokenEncConfigured()) {
    return NextResponse.json(
      { error: "BLOOMOS_TOKEN_ENC_KEY is not set (base64 of `openssl rand -base64 32`)" },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const calendarIds = Array.isArray(body?.calendarIds)
    ? body.calendarIds.filter((c): c is string => typeof c === "string" && !!c.trim())
    : [];
  if (calendarIds.length === 0) {
    return NextResponse.json({ error: "Select at least one calendar" }, { status: 400 });
  }

  const pending = await getPendingGoogleAccount(ctx.orgId, ctx.userId);
  if (!pending) {
    return NextResponse.json(
      { error: "No Google account is awaiting calendar selection — start the connect flow again." },
      { status: 404 }
    );
  }

  try {
    const available = new Map((await listAccountCalendars(pending.refreshToken)).map((c) => [c.id, c]));
    const unknown = calendarIds.filter((id) => !available.has(id));
    if (unknown.length) {
      return NextResponse.json(
        { error: `Not calendars of the connected account: ${unknown.join(", ")}` },
        { status: 400 }
      );
    }

    for (const id of calendarIds) {
      const cal = available.get(id)!;
      await upsertGoogleCalendarConnection({
        orgId: ctx.orgId,
        userId: ctx.userId,
        refreshToken: pending.refreshToken,
        calendarId: cal.id,
        label: cal.label,
        accountEmail: pending.accountEmail || undefined,
        isPrimary: cal.primary,
      });
    }
    await deletePendingGoogleAccount(ctx.orgId, ctx.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("connect-google finalize failed:", message);
    return NextResponse.json({ error: "Couldn't store the calendar connection" }, { status: 500 });
  }

  await audit(req, {
    action: "agenda.calendar_connected",
    entityType: "connection",
    entityId: null,
    after: {
      provider: "google_calendar",
      account_email: pending.accountEmail,
      calendar_ids: calendarIds,
      source: "oauth",
    },
  });
  return NextResponse.json({ ok: true, calendarIds });
}

export async function DELETE() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await deletePendingGoogleAccount(ctx.orgId, ctx.userId);
  return NextResponse.json({ ok: true });
}
