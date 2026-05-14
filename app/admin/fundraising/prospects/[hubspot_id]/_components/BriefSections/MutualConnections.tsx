import type { BriefContent } from "@/lib/agents/funder-research/types";

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
      className="rounded-card border border-white/10 bg-black/30 p-6 group"
    >
      <summary className="cursor-pointer select-none text-xs uppercase tracking-wider text-gray-mid hover:text-cream">
        Mutual connections{" "}
        <span className="text-cream/40">({data.length})</span>
      </summary>

      <div className="mt-4">
        {data.length === 0 ? (
          <p className="text-sm text-gray-mid italic">
            No internal connections found in HubSpot for this prospect.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.map((c, i) => (
              <li
                key={i}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-3"
              >
                <div className="font-medium text-cream text-sm">{c.name}</div>
                <div className="text-xs text-cream/75 mt-1">
                  {c.how_connected}
                </div>
                <div className="text-[11px] text-gray-mid mt-1">
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
