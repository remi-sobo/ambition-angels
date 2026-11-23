import { NextRequest, NextResponse } from "next/server";
import { runIntake } from "@/lib/intake/pipeline";
import { intakeDeps } from "@/lib/intake/server";

// POST /api/intake/v1/{kind} — website form intake (specs/bloomos-repo-split.md §6a).
// Authorization: Bearer <org API key>. The key resolves the org; the payload
// never names it. Every payload carries a uuid submission_id for idempotency.
// Gates and their order live in lib/intake/pipeline.ts.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { kind: string } }) {
  const body = await req.json().catch(() => null);
  const { status, body: out } = await runIntake(intakeDeps(), {
    kind: params.kind,
    authorization: req.headers.get("authorization"),
    body,
  });
  return NextResponse.json(out, { status, headers: { "cache-control": "no-store" } });
}
