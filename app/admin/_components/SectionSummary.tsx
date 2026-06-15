import Link from "next/link";
import { getSectionSummary, type SectionKey, type SummarySeverity } from "@/lib/admin/briefing/summary";

// One-line section summary (spec Phase 5), computed from the same briefing
// signals. A dot encodes the worst severity; a clear section reads green.
// Server component — it fetches its own slice, so a page just drops it in.
const DOT: Record<SummarySeverity, string> = {
  critical: "bg-status-critical",
  watch: "bg-status-watch",
  due_soon: "bg-status-due",
  clear: "bg-status-healthy",
};

export default async function SectionSummary({ section }: { section: SectionKey }) {
  const { sentence, severity } = await getSectionSummary(section);
  return (
    <div className="flex items-center gap-2.5 rounded-card border-[1.5px] border-outline bg-surface px-4 py-2.5 mb-5 text-sm text-ink-1">
      <span aria-hidden className={`w-2 h-2 rounded-full shrink-0 ${DOT[severity]}`} />
      <span className="min-w-0 flex-1">{sentence}</span>
      {severity !== "clear" && (
        <Link
          href="/admin/briefing"
          className="text-[11px] font-semibold text-orange hover:text-orange-dark shrink-0"
        >
          Briefing →
        </Link>
      )}
    </div>
  );
}
