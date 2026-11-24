import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/site/adminAuth";
import { retryPending } from "@/lib/site/outbox";

// POST /api/site-admin/forms/retry — the forms screen's "retry now".
export async function POST() {
  const gate = await requireSiteAdmin();
  if (!gate.ok) return gate.response;
  try {
    return NextResponse.json(await retryPending());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Retry failed" }, { status: 500 });
  }
}
