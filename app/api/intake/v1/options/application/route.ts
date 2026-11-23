import { NextRequest, NextResponse } from "next/server";
import { openCohorts } from "@/lib/intake/application";
import { authenticate } from "@/lib/intake/pipeline";
import { intakeDeps } from "@/lib/intake/server";

// GET /api/intake/v1/options/application — the cohorts the key's org is
// taking applications for, for the website's /apply program picker. The only
// read the website needs. Same key, same scope as posting an application.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const deps = intakeDeps();
  const auth = await authenticate(deps, req.headers.get("authorization"));
  if (!auth.ok) return NextResponse.json(auth.outcome.body, { status: auth.outcome.status });
  if (!auth.key.scopes.includes("intake:forms")) {
    return NextResponse.json({ error: "This key lacks the intake:forms scope." }, { status: 403 });
  }
  try {
    const cohorts = await openCohorts(deps.ctxFor(auth.org));
    return NextResponse.json({ cohorts }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[intake] options/application failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not load programs." }, { status: 500 });
  }
}
