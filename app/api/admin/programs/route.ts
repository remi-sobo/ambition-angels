import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";

// Empty payload returned when the schema isn't in place yet (table or
// column missing). Lets the admin UI render an empty state instead of a
// 500 the user can't act on. The shape mirrors the success path so the
// client doesn't need a separate code branch.
const EMPTY_PAYLOAD = { signups: [], typeBreakdown: [] };

// PostgreSQL error codes that mean "schema isn't there yet" rather than a
// runtime failure. The program_partners table has no committed migration
// (it was created via the Supabase UI), so a column drift between code and
// the live schema is plausible — soft-fail keeps the dashboard usable.
const SCHEMA_MISSING_CODES = new Set([
  "42P01", // undefined_table
  "42703", // undefined_column
]);

export async function GET() {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("program_partners")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    // Log full structured Supabase error so Vercel reveals the actual
    // cause on future failures. Supabase errors carry schema metadata
    // only (code / message / hint / details) — no auth material — so
    // this is safe to dump verbatim.
    console.error("[/api/admin/programs] supabase error:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    if (error.code && SCHEMA_MISSING_CODES.has(error.code)) {
      return NextResponse.json(EMPTY_PAYLOAD);
    }
    return NextResponse.json(
      { error: "Failed to fetch program partners" },
      { status: 500 }
    );
  }

  const signups = data ?? [];
  const breakdown: Record<string, number> = {};
  for (const row of signups) {
    const t = row.program_type ?? "Unknown";
    breakdown[t] = (breakdown[t] ?? 0) + 1;
  }
  const typeBreakdown = Object.entries(breakdown)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ signups, typeBreakdown });
}
