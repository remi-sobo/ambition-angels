import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { laDateString } from "@/lib/games/guess";

// Shared loader: today's Never Heard of It career, fully gated. A row must
// exist in game_daily for today (America/Los_Angeles), the occupation must
// still be pool-eligible for the daily, and its card must still be
// approved — a revoke anywhere upstream turns today off rather than
// serving something a human pulled.

export type DailyCard = {
  soc_code: string;
  title: string;
  title_variants: string[];
  pay_median: number | null;
  pay_p90: number | null;
  pay_as_of: string;
  education_typical: string | null;
  day_vignette: string | null;
  clues: (string | null)[];
};

export async function loadToday(): Promise<{ day: string; card: DailyCard } | null> {
  const day = laDateString();
  const supabase = getSupabaseAdmin();

  const { data: daily } = await supabase
    .from("game_daily")
    .select("soc_code")
    .eq("game", "nhoi")
    .eq("day", day)
    .maybeSingle();
  if (!daily) return null;

  const [{ data: pool }, { data: occ }, { data: card }] = await Promise.all([
    supabase
      .from("game_pool")
      .select("soc_code")
      .eq("soc_code", daily.soc_code)
      .eq("eligible", true)
      .eq("daily", true)
      .maybeSingle(),
    supabase
      .from("ms_occupations")
      .select("soc_code, title, title_variants, pay_median, pay_p90, pay_as_of, education_typical")
      .eq("soc_code", daily.soc_code)
      .maybeSingle(),
    supabase
      .from("ms_cards")
      .select("day_vignette, clue_1, clue_2, clue_3, clue_4, clue_5, clue_6, clue_7, clue_8")
      .eq("soc_code", daily.soc_code)
      .eq("status", "approved")
      .maybeSingle(),
  ]);
  if (!pool || !occ || !card) return null;

  return {
    day,
    card: {
      soc_code: occ.soc_code,
      title: occ.title,
      title_variants: occ.title_variants ?? [],
      pay_median: occ.pay_median,
      pay_p90: occ.pay_p90,
      pay_as_of: occ.pay_as_of,
      education_typical: occ.education_typical,
      day_vignette: card.day_vignette,
      clues: [
        card.clue_1, card.clue_2, card.clue_3, card.clue_4,
        card.clue_5, card.clue_6, card.clue_7, card.clue_8,
      ],
    },
  };
}
