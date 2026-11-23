import { NextRequest, NextResponse } from "next/server";
import { websiteDb } from "@/lib/site/websiteDb";
import { requireAaOnly } from "@/lib/admin/aaOnly";

// Curation step of the card pipeline (ms-career-library-v2.md step 2):
// Remi picks an imported occupation for the catalog. A queued occupation is
// an ms_cards row with no content yet — the SOC-code primary key IS the
// dedup check, so "do we already have this one" is answered here, exactly
// once, before any generation spend.
export async function POST(req: NextRequest) {
  const gate = await requireAaOnly("aa.career_library", { write: true });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { soc_code } = await req.json().catch(() => ({}));
  if (typeof soc_code !== "string" || !/^\d{2}-\d{4}$/.test(soc_code)) {
    return NextResponse.json({ error: "Invalid soc_code" }, { status: 400 });
  }

  const supabase = websiteDb();
  const { data: occ } = await supabase
    .from("ms_occupations")
    .select("soc_code, title")
    .eq("soc_code", soc_code)
    .maybeSingle();
  if (!occ) {
    return NextResponse.json({ error: "Occupation not imported" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("ms_cards")
    .select("soc_code, status")
    .eq("soc_code", soc_code)
    .maybeSingle();
  if (existing) {
    // The cache says so and stops.
    return NextResponse.json({ ok: true, already: true, status: existing.status });
  }

  const { error } = await supabase.from("ms_cards").insert({ soc_code, status: "draft" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, already: false });
}
