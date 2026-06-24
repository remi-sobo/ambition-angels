import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";

// ── Validation ─────────────────────────────────────────────────────────────

type RawBody = Record<string, unknown>;

const SCORE_KEYS = [
  "capacity",
  "likelihood",
  "alignment",
  "relationship",
  "strategic_leverage",
  "stage_fit",
  "energy_suck",
] as const;

type ScoreKey = (typeof SCORE_KEYS)[number];

/**
 * Each dimension is `number 0..10` or null. Anything else gets reported in
 * the 400 response so the client can surface which field is bad.
 */
function parseScoreField(
  key: ScoreKey,
  raw: unknown
): { ok: true; value: number | null } | { ok: false; reason: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { ok: false, reason: `${key} must be a number or null` };
  }
  const n = Math.round(raw);
  if (n < 0 || n > 10) {
    return { ok: false, reason: `${key} must be between 0 and 10` };
  }
  return { ok: true, value: n };
}

function parseNotes(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

// ── Route ──────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prospectId = params.id;
  if (!prospectId || typeof prospectId !== "string") {
    return NextResponse.json({ error: "Invalid prospect id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as RawBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate each dimension; collect errors so the client gets the worst
  // offender named directly.
  const scores: Partial<Record<`score_${ScoreKey}`, number | null>> = {};
  for (const key of SCORE_KEYS) {
    const result = parseScoreField(key, body[key]);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    scores[`score_${key}` as const] = result.value;
  }

  const notes = parseNotes(body.notes);
  const scoredBy = await getAdminUser();

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("fr_prospect_scores")
    .upsert(
      {
        prospect_id: prospectId,
        ...scores,
        notes,
        scored_by: scoredBy,
        scored_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "prospect_id" }
    )
    .select("*")
    .single();

  if (error) {
    console.error("[/api/admin/prospects/:id/score] supabase error:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      { error: "Failed to save score" },
      { status: 500 }
    );
  }

  return NextResponse.json({ score: data });
}
