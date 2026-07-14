import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeClaimCode, CLAIM_CODE_LENGTH } from "@/lib/ms/claim";
import DeckCodeEntry from "../DeckCodeEntry";
import SendToAdult from "./SendToAdult";

// The deck (Phase 4): the artifact that cannot get lost. Permanent, no
// login, reachable forever by the six-character code. A wall of everything
// this student explored, each card showing how few clues the table needed.
// A mistyped code gets the entry form back, not a dead end.
export const metadata: Metadata = {
  title: "Your Deck — What Are You Built For",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const fmtPay = (n: number | null) => (n == null ? "" : `$${n.toLocaleString("en-US")}`);

export default async function DeckPage({ params }: { params: { code: string } }) {
  const code = normalizeClaimCode(decodeURIComponent(params.code));
  if (code.length !== CLAIM_CODE_LENGTH) {
    return <DeckCodeEntry wrongCode={params.code.slice(0, 12)} />;
  }

  const supabase = getSupabaseAdmin();
  const { data: session } = await supabase
    .from("ms_sessions")
    .select("id, claim_code")
    .eq("claim_code", code)
    .maybeSingle();
  if (!session) {
    return <DeckCodeEntry wrongCode={code} />;
  }

  const { data: explored } = await supabase
    .from("ms_explored")
    .select("soc_code, clues_used, created_at, ms_occupations(title, pay_median, job_zone), ms_cards(field)")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  const cards = (explored ?? []).map((e) => {
    const occ = e.ms_occupations as unknown as {
      title: string;
      pay_median: number | null;
      job_zone: number;
    } | null;
    const card = e.ms_cards as unknown as { field: string | null } | null;
    return {
      socCode: e.soc_code,
      cluesUsed: e.clues_used as number,
      title: occ?.title ?? "",
      payMedian: occ?.pay_median ?? null,
      jobZone: occ?.job_zone ?? 5,
      field: card?.field ?? null,
    };
  });

  return (
    <div className="min-h-screen bg-ink text-cream">
      <div className="max-w-xl mx-auto px-6 py-14">
        <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50 mb-4">
          Your deck · it can&rsquo;t get lost
        </p>
        {/* The claim code is the largest type on the page, on purpose. */}
        <h1 className="font-display text-7xl sm:text-8xl leading-none tracking-[0.12em] text-orange break-all">
          {session.claim_code}
        </h1>
        <p className="font-body text-cream/60 mt-4 mb-10">
          Write this down. Any phone, any time, no login — this code opens this page forever.
        </p>

        {cards.length === 0 ? (
          <div className="rounded-2xl border border-cream/12 px-6 py-8">
            <p className="font-heading font-semibold text-lg">Nothing in the deck yet.</p>
            <p className="font-body text-cream/60 mt-1">
              Go back to your list and take a career all the way to the answer — it lands here.
            </p>
            <Link
              href={`/ms/results/${session.id}`}
              className="inline-block mt-5 bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-8 py-3 rounded-full"
            >
              Back to your list
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cards.map((c) => (
                <div key={c.socCode} className="rounded-2xl border border-cream/12 px-5 py-4">
                  <p className="font-heading font-semibold text-lg leading-snug">{c.title}</p>
                  <p className="font-body text-[12px] text-cream/45 mt-1">
                    Got it on clue {c.cluesUsed} of 8
                  </p>
                  <p className="font-body text-[12px] text-cream/45">
                    {fmtPay(c.payMedian)}
                    {c.jobZone <= 3 ? " · no four-year degree" : ""}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Link
                href={`/ms/results/${session.id}`}
                className="font-body text-sm text-cream/50 hover:text-cream transition-colors"
              >
                &larr; Back to your ranked list — there&rsquo;s more to explore
              </Link>
            </div>
          </>
        )}

        <SendToAdult claimCode={session.claim_code} hasCards={cards.length > 0} />

        <p className="font-body text-[11px] text-cream/30 mt-10">
          Career data: U.S. Department of Labor O*NET&reg; and Bureau of Labor Statistics.
        </p>
      </div>
    </div>
  );
}
