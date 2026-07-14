import Link from "next/link";

/**
 * Contextual back link for pages reached from a Strategy Narrative money
 * widget (?from=narrative). The narrative's widgets are purely navigational —
 * the detail records live on the destination page — so this chip returns the
 * operator to the movement they clicked from. Renders nothing otherwise.
 */
export default function NarrativeBackLink({ from }: { from?: string | string[] }) {
  if (from !== "narrative") return null;
  return (
    <div className="mb-4">
      <Link
        href="/admin/strategic-plan/narrative#movement-2"
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-orange/60 bg-orange/15 text-orange text-xs font-semibold hover:bg-orange/25 transition-colors"
      >
        ← Back to Strategy Narrative
      </Link>
    </div>
  );
}
