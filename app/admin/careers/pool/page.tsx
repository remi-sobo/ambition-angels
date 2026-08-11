import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { eligibilityIssues } from "@/lib/games/pool";
import PageHeader from "../../_components/PageHeader";
import StatCard from "../../_components/StatCard";
import { PoolControls, type PoolOccupation, type PoolRow } from "./_components/PoolControls";

// The play pool (specs/teen-games-v1.md Phase 1): the gate between the
// imported occupations and anything a teen sees in the games. This screen
// is where Remi flips occupations eligible and approves the one-line
// reveal — target is 300 before Higher Wage launches. Like the card
// review, a tool, not a product.
export const dynamic = "force-dynamic";

const ELIGIBLE_TARGET = 300;

export default async function PoolPage() {
  const supabase = getSupabaseAdmin();
  const [{ data: occData }, { data: poolData }] = await Promise.all([
    supabase
      .from("ms_occupations")
      .select("soc_code, title, description, pay_median, job_zone")
      .order("title"),
    supabase.from("game_pool").select("*"),
  ]);

  const occupations = (occData ?? []) as PoolOccupation[];
  const pool = (poolData ?? []) as PoolRow[];
  const poolBySoc = new Map(pool.map((r) => [r.soc_code, r]));

  const eligible = pool.filter((r) => r.eligible).length;
  const blocked = occupations.filter((o) => eligibilityIssues(o).length > 0).length;
  const candidates = occupations.length - blocked - eligible;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title="Play Pool"
        subtitle="The gate between the O*NET import and the teen games · nothing plays until a row here says so"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
        <StatCard label="Imported" value={occupations.length} sub="occupations (O*NET + BLS)" muted />
        <StatCard label="Candidates" value={candidates} sub="clean, awaiting your call" muted={candidates === 0} />
        <StatCard
          label="Eligible"
          value={eligible}
          sub={`target ${ELIGIBLE_TARGET} before Higher Wage launches`}
          muted={eligible === 0}
        />
        <StatCard label="Blocked" value={blocked} sub="catch-alls, no pay, thin description" muted />
      </div>

      <p className="text-[12px] text-ink-2 mb-6">
        Card writing lives in the{" "}
        <Link href="/admin/careers" className="underline underline-offset-2">
          Career Library
        </Link>
        ; this list only decides who is in the game.
      </p>

      <PoolControls occupations={occupations} pool={Object.fromEntries(poolBySoc)} />
    </div>
  );
}
