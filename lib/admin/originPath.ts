/**
 * Spec B, stage B6 — origin_path hygiene for the in-app reporter (the
 * preservation gate's one permitted upgrade: the page the reporter was on,
 * stored structured on the task instead of buried in the synthesized prompt).
 *
 * Pure. Accepts only an app-relative /admin path (no host, no scheme — the
 * value lands in ops_tasks.origin_path and in operator email, so it must
 * never carry an attacker-shaped URL) and caps the length.
 */
export function sanitizeOriginPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.trim();
  if (!path.startsWith("/admin")) return null;
  if (path.includes("//") || /[\s<>"']/.test(path)) return null;
  return path.slice(0, 200);
}
