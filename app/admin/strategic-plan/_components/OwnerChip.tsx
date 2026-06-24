import { resolveOwner } from "@/lib/admin/plan/owners";

// Owner as identity, not text (Phase D). A resolved person renders as an initials
// avatar in the brand tint; an external owner (Empathy Labs, a contractor) gets a
// visibly different outlined avatar and an "· ext" tag, so accountability reads at
// a glance and people are distinguishable from outside parties. Pure (no hooks),
// so it works in both server and client trees.
export default function OwnerChip({ owner, className = "" }: { owner: string | null; className?: string }) {
  const r = resolveOwner(owner);
  if (!r) return null;
  const initials = r.label
    .split(/[\s/,]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const person = r.id != null;

  return (
    <span className={`inline-flex items-center gap-1.5 max-w-full align-middle ${className}`} title={r.label}>
      <span
        aria-hidden
        className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 ${
          person ? "bg-orange/15 text-orange" : "border border-outline text-ink-3"
        }`}
      >
        {initials}
      </span>
      <span className="text-[11px] text-ink-2 truncate">
        {r.label}
        {!person && <span className="text-ink-3"> · ext</span>}
      </span>
    </span>
  );
}
