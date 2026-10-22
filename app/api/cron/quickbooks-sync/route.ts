import { NextRequest, NextResponse } from "next/server";
import { listQuickBooksOrgs, syncQuickBooks } from "@/lib/quickbooks/connection";

/**
 * Daily QuickBooks pull: for every org with an active connection, refresh the
 * to-date register and the cash-in-account balance (which re-anchors runway).
 * Orgs run one at a time; one org's failure is recorded on its connection and
 * never blocks the others.
 *
 * Auth via Bearer CRON_SECRET, the house cron convention.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results: Record<string, unknown> = {};
  for (const orgId of await listQuickBooksOrgs()) {
    results[orgId] = await syncQuickBooks(orgId);
  }
  return NextResponse.json({ ok: true, results });
}
