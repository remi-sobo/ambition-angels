import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { NATIONAL_MEDIAN, fmtUsd } from "@/lib/ms/render";
import RoomBanner from "./RoomBanner";

// The result (Phase 2, rows made playable in Phase 3): the ranked catalog,
// pay sitting quietly next to each career, not headlining it. Tapping a
// career starts the card — THE DAY, then the clue ladder, then THE ANSWER.
// Explored cards show how few clues the table needed. Server-rendered on
// the service role: session rows and titles never travel through an anon
// client path.
export const metadata: Metadata = {
  title: "What You're Built For",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type RankedEntry = { soc_code: string; score: number; job_zone: number; promoted: boolean };

const fmtPay = (n: number | null) => (n == null ? "" : `$${n.toLocaleString("en-US")}`);

export default async function ResultsPage({ params }: { params: { session: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.session)) notFound();

  const supabase = getSupabaseAdmin();
  const { data: session } = await supabase
    .from("ms_sessions")
    .select("id, claim_code, ranked_careers, created_at, handle, room_id, ms_rooms(room_code)")
    .eq("id", params.session)
    .maybeSingle();
  if (!session) notFound();
  const room = session.ms_rooms as unknown as { room_code: string } | null;

  const ranked = (session.ranked_careers ?? []) as RankedEntry[];
  const socCodes = ranked.map((r) => r.soc_code);
  const [{ data: occs }, { data: explored }] = await Promise.all([
    supabase.from("ms_occupations").select("soc_code, title, pay_median").in("soc_code", socCodes),
    supabase
      .from("ms_explored")
      .select("soc_code, clues_used")
      .eq("session_id", params.session),
  ]);
  const occBySoc = new Map((occs ?? []).map((o) => [o.soc_code, o]));
  const exploredBySoc = new Map((explored ?? []).map((e) => [e.soc_code, e.clues_used as number]));

  return (
    <div className="min-h-screen bg-ink text-cream">
      <div className="max-w-xl mx-auto px-6 py-14">
        <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50 mb-4">
          Your results
        </p>
        <h1 className="font-display text-5xl sm:text-6xl leading-[0.95] mb-3">
          Here&rsquo;s what you&rsquo;re <span className="text-orange">built for</span>
        </h1>
        <p className="font-body text-cream/60 mb-10">
          Ranked by how you&rsquo;re actually wired. Tap one you&rsquo;ve never heard of. Tell nobody.
        </p>

        {room && session.handle && (
          <RoomBanner sessionId={session.id} roomCode={room.room_code} handle={session.handle} />
        )}

        <ol className="space-y-2.5">
          {ranked.map((entry, i) => {
            const occ = occBySoc.get(entry.soc_code);
            if (!occ) return null;
            const cluesUsed = exploredBySoc.get(entry.soc_code);
            return (
              <li key={entry.soc_code}>
                <Link
                  href={`/ms/card/${params.session}/${entry.soc_code}`}
                  className="flex items-baseline gap-4 rounded-2xl border border-cream/12 hover:border-orange/70 transition-colors px-5 py-4"
                >
                  <span className="font-display text-3xl text-orange w-10 flex-shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-semibold text-lg leading-snug">{occ.title}</p>
                    <p className="font-body text-[12px] text-cream/45 mt-0.5">
                      {cluesUsed != null
                        ? `In your deck · got it on clue ${cluesUsed}`
                        : entry.job_zone <= 3
                          ? "No four-year degree needed"
                          : " "}
                    </p>
                  </div>
                  <span className="font-body text-sm text-cream/40 tabular-nums flex-shrink-0">
                    {fmtPay(occ.pay_median)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>

        <Link
          href={`/ms/deck/${session.claim_code}`}
          className="block mt-10 rounded-2xl border border-orange/50 hover:border-orange transition-colors px-6 py-5"
        >
          <p className="font-heading text-[11px] tracking-[0.25em] uppercase text-cream/50">
            Your deck code · write this down
          </p>
          <p className="font-display text-5xl sm:text-6xl tracking-[0.12em] text-orange mt-2">
            {session.claim_code}
          </p>
          <p className="font-body text-sm text-cream/60 mt-2">
            Everything you explore lands in your deck. This code opens it on any device, forever.
          </p>
        </Link>

        <p className="font-body text-[11px] text-cream/30 mt-10">
          Pay figures: U.S. Bureau of Labor Statistics, median annual wage. Career data:
          U.S. Department of Labor O*NET&reg;. The typical American worker makes{" "}
          {fmtUsd(NATIONAL_MEDIAN.value)}.
        </p>
      </div>
    </div>
  );
}
