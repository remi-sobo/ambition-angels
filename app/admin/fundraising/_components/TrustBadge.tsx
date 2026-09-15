import { TRUST_HINTS, TRUST_LABELS, type TrustLevel } from "@/lib/fundraising/plan";

// Provenance label for a plan figure (specs/fundraising-plan.md). Every
// rolled-up number on a plan surface says where it came from: verified money,
// a stated commitment, an estimate, or a placeholder. Server-renderable; the
// hint rides on `title` so the label stays one quiet word.

const STYLES: Record<TrustLevel, string> = {
  verified: "text-revenue bg-revenue-bg border-revenue/30",
  stated: "text-ink-2 bg-tile border-hairline",
  estimated: "text-orange bg-orange/10 border-orange/30",
  placeholder: "text-ink-3 bg-transparent border-hairline border-dashed",
};

export default function TrustBadge({ level }: { level: TrustLevel }) {
  return (
    <span
      title={TRUST_HINTS[level]}
      className={`inline-block align-middle text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border cursor-help ${STYLES[level]}`}
    >
      {TRUST_LABELS[level]}
    </span>
  );
}
