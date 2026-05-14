import type { BriefContent } from "@/lib/agents/funder-research/types";

export default function HowWeFit({
  data,
  defaultOpen = false,
}: {
  data: BriefContent["how_we_fit"];
  defaultOpen?: boolean;
}) {
  return (
    <details
      {...(defaultOpen ? { open: true } : {})}
      className="rounded-card border border-white/10 bg-black/30 p-6 group"
    >
      <summary className="cursor-pointer select-none text-xs uppercase tracking-wider text-gray-mid hover:text-cream">
        How we fit
      </summary>

      <div className="mt-4 space-y-5">
        {data.framing_note && (
          <div className="rounded-lg border-l-4 border-amber-400/70 bg-amber-400/[0.05] p-3">
            <div className="text-[10px] uppercase tracking-wider text-amber-300/90 mb-1">
              Framing
            </div>
            <p className="text-sm text-cream/90 italic leading-relaxed">
              {data.framing_note}
            </p>
          </div>
        )}

        {data.matching_priorities.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-cream/50 mb-2">
              Where we plausibly fit (their language)
            </div>
            <ul className="space-y-1.5 text-sm text-cream/85">
              {data.matching_priorities.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-orange/70 shrink-0">▸</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.our_matching_stories.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-cream/50 mb-2">
              How our story maps
            </div>
            <ul className="space-y-1.5 text-sm text-cream/85">
              {data.our_matching_stories.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-orange/70 shrink-0">▸</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.honest_gaps.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-cream/50 mb-2">
              Honest gaps
            </div>
            <ul className="space-y-1.5 text-sm text-cream/75">
              {data.honest_gaps.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-cream/40 shrink-0">·</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
