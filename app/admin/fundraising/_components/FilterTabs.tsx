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
}: {
  options: FilterOption[];
  current: string;
  paramKey: string;
  basePath: string;
  // Other params to keep when switching this one (e.g. the year while
  // changing the pipeline).
  extraParams?: Record<string, string>;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs";
  return (
    <div className="inline-flex items-center gap-1 bg-tile border-[1.5px] border-outline rounded-full p-1">
      {options.map((o) => {
        const params = new URLSearchParams({ ...extraParams, [paramKey]: o.value });
        const active = o.value === current;
        return (
          <Link
            key={o.value}
            href={`${basePath}?${params.toString()}`}
            className={`font-semibold rounded-full transition-colors ${pad} ${
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
