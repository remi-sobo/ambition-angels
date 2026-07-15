"use client";

import { TYPE } from "@/lib/admin/typeScale";

// Daypart + date are computed in the viewer's timezone, so this must be a
// client component — the server renders in UTC. suppressHydrationWarning
// covers the rare mismatch when the page is server-rendered near a daypart
// boundary in a different zone.
//
// `name` is the signed-in person's first name (resolved server-side from their
// profile); `org` is used in the subtitle. We greet the person, not the org.
export default function Greeting({ name, org }: { name: string; org: string }) {
  const now = new Date();
  const h = now.getHours();
  const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div>
      <div className="text-xs text-ink-2 mb-1" suppressHydrationWarning>
        {date}
      </div>
      <h1
        className={`${TYPE.pageTitle} sm:text-3xl tracking-tight`}
        suppressHydrationWarning
      >
        Good {part}, {name}.
      </h1>
      <p className={`${TYPE.bodyMuted} mt-1`}>
        Here&apos;s what&apos;s happening across {org} today.
      </p>
    </div>
  );
}
