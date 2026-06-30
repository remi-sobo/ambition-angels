import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import PageHeader from "../../_components/PageHeader";
import NewAngleForm from "./_components/NewAngleForm";
import ReedAngleWizard from "./_components/ReedAngleWizard";
import AngleEditorCard, { type AdminAngle } from "./_components/AngleEditorCard";

// Strategy tab — the editable source for the public Strategy Room
// (app/strategy). Every framing angle is read from strategy_angles and edited
// in place here; Reed can draft a new one from a brief. The per-angle funder
// funnel lives behind "Open funnel →".
export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("strategy_angles")
    .select(
      "id, key, name, nav_title, status_badge, tone, hook, frame, lead, funds_label, funds, want, catch_label, catch_body, ask, flag, approach, sort_order, is_active",
    )
    .order("sort_order", { ascending: true });

  if (error) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
        <PageHeader title="Strategy" subtitle="Funding angles" />
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The <code className="text-orange">strategy_angles</code> table isn&apos;t ready yet. Apply{" "}
          <code className="text-orange">create_strategy_angles.sql</code> and{" "}
          <code className="text-orange">extend_strategy_angles_framing.sql</code> via the Supabase SQL
          editor, then reload.
        </div>
      </div>
    );
  }

  const angles = (data ?? []) as AdminAngle[];

  // Funder counts per angle for the card footer.
  const { data: faRows } = await supabase.from("funder_angles").select("angle_id");
  const counts = new Map<string, number>();
  for (const r of (faRows ?? []) as { angle_id: string }[]) {
    counts.set(r.angle_id, (counts.get(r.angle_id) ?? 0) + 1);
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title="Strategy"
        subtitle={
          <>
            {angles.length} framing angles · the editable source for the{" "}
            <Link href="/strategy" className="text-orange hover:underline">Strategy Room</Link>
          </>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <ReedAngleWizard />
            <NewAngleForm />
          </div>
        }
      />

      <p className="text-xs text-ink-3 mb-4 max-w-2xl">
        Click any element to edit it — changes save on blur and show in the Strategy Room on its next load.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {angles.map((a) => (
          <AngleEditorCard key={a.id} angle={a} funderCount={counts.get(a.id) ?? 0} />
        ))}
      </div>
    </div>
  );
}
