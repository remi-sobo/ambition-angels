/**
 * Disconnect the signed-in person's Google Calendar: stop syncing, delete the
 * stored permission and the cached events. Only ever the caller's own
 * connections. See lib/google/calendar-disconnect.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { disconnectGoogleCalendar } from "@/lib/google/calendar-disconnect";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await disconnectGoogleCalendar({ orgId: ctx.orgId, userId: ctx.userId });
    await audit(req, {
      action: "agenda.calendar_disconnected",
      entityType: "connection",
      entityId: null,
      before: {
        provider: "google_calendar",
        account_emails: result.accountEmails,
        calendar_ids: result.calendarIds,
      },
      after: { revoked_grants: result.revoked },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("disconnect calendar failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't disconnect your calendar. Try again." }, { status: 500 });
  }
}
