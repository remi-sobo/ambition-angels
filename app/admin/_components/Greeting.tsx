"use client";

// Daypart + date are computed in the viewer's timezone, so this must be a
// client component — the server renders in UTC. suppressHydrationWarning
// covers the rare mismatch when the page is server-rendered near a daypart
// boundary in a different zone.
export default function Greeting({ org }: { org: string }) {
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
      <div className="text-xs text-gray-mid mb-1" suppressHydrationWarning>
        {date}
      </div>
      <h1
        className="font-heading font-bold text-cream text-2xl sm:text-3xl tracking-tight"
        suppressHydrationWarning
      >
        Good {part}, {org}.
      </h1>
      <p className="text-gray-mid text-sm mt-1">
        Here&apos;s what&apos;s happening across your mission today.
      </p>
    </div>
  );
}
