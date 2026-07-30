"use client";

import { Children, useState, type ReactNode } from "react";

// Client-side truncation for long profile lists (Activity, Comms): shows the
// first `limit` rows with a Show more / Show less toggle. Rows come in as
// children so they stay server-rendered — only visibility lives here.
export default function ExpandableList({
  children,
  limit = 5,
}: {
  children: ReactNode;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const hidden = items.length - limit;
  return (
    <>
      <ul className="divide-y divide-hairline">{expanded ? items : items.slice(0, limit)}</ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left px-5 py-2.5 border-t border-outline text-[11px] font-semibold text-orange hover:text-orange-dark transition-colors"
        >
          {expanded ? "Show less" : `Show more · ${hidden} hidden`}
        </button>
      )}
    </>
  );
}
