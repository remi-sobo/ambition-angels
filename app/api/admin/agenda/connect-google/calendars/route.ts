/**
 * Calendar picker data: the calendars visible to the Google account the user
 * just authenticated (staged as their `pending` connection), plus which of
 * them are already connected. Serves the Settings picker after ?calendar=pick.
 */
import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getPendingGoogleAccount, getCalendarConnectionStatus } from "@/lib/google/connection";
import { listAccountCalendars } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pending = await getPendingGoogleAccount(ctx.orgId, ctx.userId);
  if (!pending) {
    return NextResponse.json(
      { error: "No Google account is awaiting calendar selection — start the connect flow again." },
      { status: 404 }
    );
  }

  try {
    const [calendars, status] = await Promise.all([
      listAccountCalendars(pending.refreshToken),
      getCalendarConnectionStatus(ctx.userId),
    ]);
    const connected = new Set(status.calendars.map((c) => c.calendarId));
    return NextResponse.json({
      accountEmail: pending.accountEmail,
      calendars: calendars.map((c) => ({ ...c, alreadyConnected: connected.has(c.id) })),
    });
  } catch (err) {
    console.error("listing account calendars failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't list this account's calendars" }, { status: 500 });
  }
}
