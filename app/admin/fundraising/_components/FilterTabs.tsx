import Link from "next/link";

// A server-rendered segmented control: each option is a link that sets one
// search param while preserving the others. No client JS — filter state lives
// in the URL so the server component re-renders with the chosen filter.

export type FilterOption = { value: string; label: string };

export default function FilterTabs({
  options,
  current,
  paramKey,
  basePath,
  extraParams,
  size = "md",
  wrap = false,
  hash,
}: {
  options: FilterOption[];
  current: string;
  paramKey: string;
  basePath: string;
  // Other params to keep when switching this one (e.g. the year while
  // changing the pipeline).
  extraParams?: Record<string, string>;
  size?: "sm" | "md";
  // Let a long strip reflow onto a second line instead of overflowing its row.
  // Without it a strip wider than the container clips its trailing options,
  // which makes them unclickable (the documents type strip, 13 options).
  wrap?: boolean;
  /** An anchor to land on (e.g. "ask-log" for a section lower on the page). */
  hash?: string;
}) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs";
  return (
    <div
      className={`items-center gap-1 bg-tile border-hairline p-1 ${
        // V4 A2 (spec §10, phone 390): a non-wrapping strip scrolls inside
        // its own box instead of widening the page.
        wrap ? "flex flex-wrap rounded-panel-lg" : "inline-flex max-w-full overflow-x-auto v2-tab-scroll rounded-full"
      }`}
    >
      {options.map((o) => {
        const params = new URLSearchParams({ ...extraParams, [paramKey]: o.value });
        const active = o.value === current;
        return (
          <Link
            key={o.value}
            href={`${basePath}?${params.toString()}${hash ? `#${hash}` : ""}`}
            aria-current={active ? "true" : undefined}
            className={`shrink-0 whitespace-nowrap font-semibold rounded-full transition-colors ${pad} ${
              active ? "bg-orange text-white" : "text-ink-2 hover:text-ink-1"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
