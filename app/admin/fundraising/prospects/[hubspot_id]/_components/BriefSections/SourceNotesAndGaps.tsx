import type { BriefContent } from "@/lib/agents/funder-research/types";

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

export default function SourceNotesAndGaps({
  data,
  defaultOpen = false,
}: {
  data: BriefContent["source_notes_and_gaps"];
  defaultOpen?: boolean;
}) {
  return (
    <details
      {...(defaultOpen ? { open: true } : {})}
      className="rounded-card border border-white/10 bg-black/30 p-6 group"
    >
      <summary className="cursor-pointer select-none text-xs uppercase tracking-wider text-gray-mid hover:text-cream">
        Source notes &amp; gaps
      </summary>

      <div className="mt-4 space-y-5">
        {data.sources.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-cream/50 mb-2">
              Sources
            </div>
            <ul className="space-y-1 text-xs text-cream/75">
              {data.sources.map((s, i) => (
                <li key={i} className="break-all">
                  {isUrl(s) ? (
                    <a
                      href={s}
                      target="_blank"
                      rel="noreferrer"
                      className="text-orange hover:underline"
                    >
                      {s}
                    </a>
                  ) : (
                    s
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.gaps.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-amber-300/80 mb-2">
              Gaps
            </div>
            <ul className="space-y-1.5 text-xs text-cream/80">
              {data.gaps.map((g, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-300/60 shrink-0">·</span>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.sources.length === 0 && data.gaps.length === 0 && (
          <p className="text-sm text-gray-mid italic">
            No sources or gaps logged.
          </p>
        )}
      </div>
    </details>
  );
}
