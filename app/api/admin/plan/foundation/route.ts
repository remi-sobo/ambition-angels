import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// values / behaviors are stored as jsonb string arrays. Coerce loosely so the
// editor can post either a string[] or a newline-joined string.
const toList = (v: unknown): string[] | undefined => {
  if (Array.isArray(v))
    return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 30);
  if (typeof v === "string")
    return v.split(/[\n,]/).map((x) => x.trim()).filter(Boolean).slice(0, 30);
  return undefined;
};
const toText = (v: unknown): string | null | undefined =>
  v === null || v === "" ? null : typeof v === "string" ? v.trim().slice(0, 4000) : undefined;

// proof_points: a jsonb array of { value, label }. Accept an array of objects
// (or {value,label}-ish), trim, drop blanks, cap the count. null clears it.
const toProofPoints = (v: unknown): { value: string; label: string }[] | null | undefined => {
  if (v === null) return null;
  if (!Array.isArray(v)) return undefined;
  return v
    .map((p) => ({
      value: String((p as { value?: unknown })?.value ?? "").trim().slice(0, 40),
      label: String((p as { label?: unknown })?.label ?? "").trim().slice(0, 80),
    }))
    .filter((p) => p.value)
    .slice(0, 8);
};

// Upsert the single foundation row for the caller's org (unique on org_id).
export async function PUT(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const row: Record<string, unknown> = { org_id: ctx.orgId };
  const mission = toText(body.mission);
  if (mission !== undefined) row.mission = mission;
  const vision = toText(body.vision);
  if (vision !== undefined) row.vision = vision;
  const values = toList(body.values);
  if (values !== undefined) row.values = values;
  const behaviors = toList(body.behaviors);
  if (behaviors !== undefined) row.behaviors = behaviors;
  const proofPoints = toProofPoints(body.proof_points);
  if (proofPoints !== undefined) row.proof_points = proofPoints;

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("plan_foundation").select("*").eq("org_id", ctx.orgId).maybeSingle();

  const { error } = await supabase
    .from("plan_foundation")
    .upsert(row, { onConflict: "org_id" });
  if (error) {
    console.error("Save foundation failed:", error.message);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.foundation.update",
    entityType: "plan_foundation",
    entityId: null,
    before,
    after: row,
  });
  return NextResponse.json({ ok: true });
}
