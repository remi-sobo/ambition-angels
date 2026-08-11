import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import PageHeader from "../_components/PageHeader";
import StatCard from "../_components/StatCard";
import { CareersControls, type CardView, type OccupationView } from "./_components/CareersControls";

// The career library pipeline (specs/ms-career-library-v2.md): import →
// curate → generate → machine gates → human review → serve. This surface is
// a tool for Remi, not a product — the game is the product. Only approved
// cards ever reach a student, and only a click here approves one.
export const dynamic = "force-dynamic";

export default async function CareersPage() {
  const supabase = getSupabaseAdmin();
  const [{ data: occData }, { data: cardData }] = await Promise.all([
    supabase
      .from("ms_occupations")
      .select("soc_code, title, riasec, job_zone, pay_median, pay_as_of")
      .order("title"),
    supabase.from("ms_cards").select("*").order("updated_at", { ascending: false }),
  ]);

  const occupations = (occData ?? []) as OccupationView[];
  const cards = (cardData ?? []) as CardView[];

  const queued = cards.filter((c) => c.status === "draft" && !c.day_vignette).length;
  const drafts = cards.filter((c) => c.status === "draft" && c.day_vignette).length;
  const approved = cards.filter((c) => c.status === "approved").length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title="Career Library"
        subtitle="O*NET-backed catalog for /ms · Claude drafts, machines gate, a human approves"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
        <StatCard label="Imported" value={occupations.length} sub="occupations (O*NET + BLS)" muted={occupations.length === 0} />
        <StatCard label="Queued" value={queued} sub="picked, not yet generated" muted={queued === 0} />
        <StatCard label="Awaiting review" value={drafts} muted={drafts === 0} />
        <StatCard label="Approved" value={approved} sub="live in the catalog" muted={approved === 0} />
      </div>

      <p className="text-[12px] text-ink-2 mb-6">
        Which occupations the teen games may use is a separate decision — the{" "}
        <Link href="/admin/careers/pool" className="underline underline-offset-2">
          Play Pool
        </Link>
        .
      </p>

      {occupations.length === 0 ? (
        <div className="bg-surface shadow-panel border-[1.5px] border-outline rounded-xl px-4 py-6 text-sm text-ink-2">
          <p className="font-semibold text-ink-1 mb-1">Nothing imported yet.</p>
          <p>
            Run the import once from a machine with network access:&nbsp;
            <code className="text-[12px] bg-tile px-1.5 py-0.5 rounded">
              npx tsx scripts/import-onet.ts --onet-dir &lt;o*net text db&gt; --oews-csv &lt;national OEWS csv&gt;
            </code>
            &nbsp;— see the header of that script for where the files come from.
          </p>
        </div>
      ) : (
        <CareersControls occupations={occupations} cards={cards} />
      )}
    </div>
  );
}
