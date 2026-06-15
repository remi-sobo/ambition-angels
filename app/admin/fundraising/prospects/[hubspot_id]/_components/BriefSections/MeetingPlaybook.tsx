import type { BriefContent } from "@/lib/agents/funder-research/types";

export default function MeetingPlaybook({
  data,
  defaultOpen = false,
}: {
  data: BriefContent["meeting_playbook"];
  defaultOpen?: boolean;
}) {
  return (
    <details
      {...(defaultOpen ? { open: true } : {})}
      className="rounded-card border-[1.5px] border-outline bg-black/30 p-6 group"
    >
      <summary className="cursor-pointer select-none text-xs uppercase tracking-wider text-ink-2 hover:text-ink-1">
        Meeting playbook
      </summary>

      <div className="mt-4 space-y-5">
        {data.open_questions.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
              Open questions
            </div>
            <ol className="space-y-2 text-sm text-ink-1 list-decimal pl-5 marker:text-orange marker:font-bold">
              {data.open_questions.map((q, i) => (
                <li key={i} className="pl-1 leading-relaxed">
                  {q}
                </li>
              ))}
            </ol>
          </div>
        )}

        {data.ready_stories.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
              Ready stories
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {data.ready_stories.map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg border-[1.5px] border-outline bg-surface shadow-panel p-4"
                >
                  <div className="text-sm font-semibold text-ink-1">
                    {s.title}
                  </div>
                  <p className="text-xs text-ink-1 mt-2 leading-relaxed">
                    {s.narrative_2_3_sentences}
                  </p>
                  <p className="text-xs text-orange/85 mt-2 leading-relaxed">
                    <span className="font-bold uppercase tracking-wider text-[10px] mr-1">
                      So what:
                    </span>
                    {s.punchline_the_so_what}
                  </p>
                  <p className="text-[11px] text-ink-2 mt-2 italic leading-relaxed">
                    When to use it: {s.when_to_use_it}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.one_thing_to_learn && (
          <div className="rounded-lg border-l-4 border-orange bg-orange/[0.06] p-4">
            <div className="text-[10px] uppercase tracking-wider text-orange/90 mb-1 font-bold">
              One thing to learn
            </div>
            <p className="text-sm text-ink-1 leading-relaxed">
              {data.one_thing_to_learn}
            </p>
          </div>
        )}

        {data.suggested_next_ask && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">
              Suggested next ask
            </div>
            <p className="text-sm text-ink-1 leading-relaxed">
              {data.suggested_next_ask}
            </p>
          </div>
        )}
      </div>
    </details>
  );
}
