import { NextResponse } from "next/server";
import { createSiteAuthClient } from "@/lib/site/adminAuth";

export async function POST() {
  await createSiteAuthClient().auth.signOut().catch(() => undefined);
  return NextResponse.json({ ok: true });
}
