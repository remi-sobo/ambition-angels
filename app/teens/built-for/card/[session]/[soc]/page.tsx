import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import CardClient from "./CardClient";

// The card (Phase 3): THE DAY → THE CLUES → THE ANSWER. The page payload
// carries the vignette and clues 1–7 only. Clue 8 and the title stay on the
// server until tapped for (/api/ms/reveal, D8) — the answer never sits in
// the HTML for a kid to scroll to.
export const metadata: Metadata = {
  title: "The Card — What Are You Built For",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function CardPage({
  params,
}: {
  params: { session: string; soc: string };
}) {
  if (!/^[0-9a-f-]{36}$/i.test(params.session)) notFound();
  if (!/^\d{2}-\d{4}$/.test(params.soc)) notFound();

  const supabase = getSupabaseAdmin();
  const [{ data: session }, { data: card }] = await Promise.all([
    supabase.from("ms_sessions").select("id").eq("id", params.session).maybeSingle(),
    supabase
      .from("ms_cards")
      .select("soc_code, status, day_vignette, clue_1, clue_2, clue_3, clue_4, clue_5, clue_6, clue_7")
      .eq("soc_code", params.soc)
      .eq("status", "approved")
      .maybeSingle(),
  ]);
  if (!session || !card) notFound();

  return (
    <CardClient
      sessionId={params.session}
      socCode={params.soc}
      dayVignette={card.day_vignette ?? ""}
      clues={[
        card.clue_1 ?? "",
        card.clue_2 ?? "",
        card.clue_3 ?? "",
        card.clue_4 ?? "",
        card.clue_5 ?? "",
        card.clue_6 ?? "",
        card.clue_7 ?? "",
      ]}
    />
  );
}
