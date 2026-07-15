import type { BriefContent } from "@/lib/agents/funder-research/types";
import { TYPE } from "@/lib/admin/typeScale";

export default function MutualConnections({
  data,
  defaultOpen = false,
}: {
  data: BriefContent["mutual_connections"];
  defaultOpen?: boolean;
}) {
  return (
    <details
      {...(defaultOpen ? { open: true } : {})}
      className="rounded-card border-[1.5px] border-outline bg-surface p-6 group"
    >
      <summary className="cursor-pointer select-none text-xs uppercase tracking-wider text-ink-2 hover:text-ink-1">
        Mutual connections{" "}
        <span className="text-ink-3">({data.length})</span>
      </summary>

      <div className="mt-4">
        {data.length === 0 ? (
          <p className="text-sm text-ink-2 italic">
            No internal connections found in HubSpot for this prospect.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.map((c, i) => (
              <li
                key={i}
                className="rounded-lg border-[1.5px] border-outline bg-surface shadow-panel p-3"
              >
                <div className={`font-medium ${TYPE.body}`}>{c.name}</div>
                <div className="text-xs text-ink-2 mt-1">
                  {c.how_connected}
                </div>
                <div className="text-[11px] text-ink-2 mt-1">
                  Source: {c.source}
                </div>
                {c.recent_touch_if_any && (
                  <div className="text-[11px] text-orange/80 mt-1">
                    Recent touch: {c.recent_touch_if_any}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
