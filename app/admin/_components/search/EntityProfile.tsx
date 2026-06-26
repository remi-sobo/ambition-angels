"use client";

import type { ProfilePayload } from "./types";

/**
 * The 360° profile view rendered inside the search overlay (Mode B). Pure
 * presentation — GlobalSearch fetches the payload and owns navigation; this
 * just lays out the stats, sections and timeline the route assembled.
 */
export default function EntityProfile({
  data,
  onBack,
  onOpen,
}: {
  data: ProfilePayload;
  onBack: () => void;
  onOpen: (href: string, newTab: boolean) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-ink/95 backdrop-blur border-b border-outline px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Back to search"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-ink-3 hover:text-ink-1 hover:bg-tile transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-ink-1 truncate">{data.entity.name}</div>
          <div className="text-[11px] text-ink-2 truncate">{data.entity.subtitle}</div>
        </div>
        <button
          onClick={(e) => onOpen(data.entity.href, e.metaKey || e.ctrlKey)}
          className="shrink-0 text-[11px] font-medium text-orange-mid hover:text-orange whitespace-nowrap"
        >
          Open full page →
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {data.stats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-outline bg-tile px-3 py-2"
            >
              <div
                className={[
                  "text-[15px] font-semibold tabular-nums",
                  s.tone === "warn" ? "text-orange-mid" : "text-ink-1",
                ].join(" ")}
              >
                {s.value}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-ink-2 mt-0.5">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {data.entity.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.entity.tags.map((t) => (
              <span
                key={t}
                className="text-[10px] text-ink-3 border border-outline rounded-full px-2 py-0.5"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Sections */}
        {data.sections.map((section) => (
          <div key={section.key}>
            <div className="text-[10px] font-heading font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1.5">
              {section.label}
            </div>
            <div className="space-y-px">
              {section.rows.map((row) => (
                <button
                  key={`${section.key}-${row.id}`}
                  onClick={(e) => onOpen(row.href, e.metaKey || e.ctrlKey)}
                  className="w-full text-left flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-tile transition-colors"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-ink-1 truncate">{row.title}</span>
                    {row.subtitle && (
                      <span className="block text-[11px] text-ink-2 truncate">{row.subtitle}</span>
                    )}
                  </span>
                  {row.badge && (
                    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-ink-3 border border-outline rounded-full px-1.5 py-px">
                      {row.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Activity timeline */}
        {data.timeline.length > 0 && (
          <div>
            <div className="text-[10px] font-heading font-semibold uppercase tracking-[0.14em] text-ink-3 mb-1.5">
              Activity
            </div>
            <ul className="space-y-2">
              {data.timeline.map((item, i) => (
                <li key={i} className="flex gap-3 text-[12px]">
                  <span className="shrink-0 w-14 text-ink-2 tabular-nums">{item.when ?? "—"}</span>
                  <span className="text-ink-1">
                    <span className="text-ink-3">{item.kind}</span>
                    {item.text && item.text.toLowerCase() !== item.kind.toLowerCase() && (
                      <span className="text-ink-2"> — {item.text}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.sections.length === 0 && data.timeline.length === 0 && (
          <p className="text-sm text-ink-2 text-center py-6">
            No linked records yet for {data.entity.name}.
          </p>
        )}
      </div>
    </div>
  );
}
