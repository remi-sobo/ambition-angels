"use client";

/**
 * Initial-based avatars for Messages. Color is a stable hash of the user id, so
 * a person always wears the same tile across threads. Palette is drawn from the
 * BloomOS status/accent tints so avatars sit naturally on the cream workspace.
 */

const PALETTE: { bg: string; fg: string }[] = [
  { bg: "#F3E6DD", fg: "#A85E30" }, // terracotta
  { bg: "#E2EFE5", fg: "#2F7D5B" }, // green
  { bg: "#F4E8D0", fg: "#8A5A12" }, // amber
  { bg: "#E7DCC9", fg: "#6B5C4E" }, // sand
  { bg: "#F6E3DC", fg: "#9E3A24" }, // clay-red
  { bg: "#E4E7F0", fg: "#3E4A6B" }, // slate
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function colorFor(id: string) {
  return PALETTE[hash(id) % PALETTE.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, id, size = 36 }: { name: string; id: string; size?: number }) {
  const c = colorFor(id);
  return (
    <span
      style={{ width: size, height: size, background: c.bg, color: c.fg, fontSize: size * 0.4 }}
      className="inline-flex items-center justify-center rounded-full font-bold uppercase shrink-0 leading-none"
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** Overlapping avatars for group threads (up to 3, then a +N chip). */
export function AvatarStack({
  people,
  size = 36,
}: {
  people: { userId: string; name: string }[];
  size?: number;
}) {
  if (people.length <= 1) {
    const p = people[0];
    return <Avatar name={p?.name ?? "?"} id={p?.userId ?? "x"} size={size} />;
  }
  const shown = people.slice(0, 3);
  const extra = people.length - shown.length;
  const inner = size * 0.82;
  return (
    <span className="inline-flex items-center" aria-hidden>
      {shown.map((p, i) => (
        <span
          key={p.userId}
          style={{ marginLeft: i ? -inner * 0.4 : 0, zIndex: shown.length - i }}
          className="rounded-full ring-2 ring-surface"
        >
          <Avatar name={p.name} id={p.userId} size={inner} />
        </span>
      ))}
      {extra > 0 && (
        <span
          style={{ width: inner, height: inner, marginLeft: -inner * 0.4, fontSize: inner * 0.36 }}
          className="inline-flex items-center justify-center rounded-full ring-2 ring-surface bg-gray-light text-ink-2 font-bold"
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

// ── time helpers ────────────────────────────────────────────────────────────

export function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Compact relative time for the thread-list rows. */
export function relTime(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Today" / "Yesterday" / "Mon, Jun 30" divider label. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export function sameDay(a: string, b: string): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}
