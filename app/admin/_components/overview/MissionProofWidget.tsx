import { MISSION_PROOF } from "@/lib/admin/overview/mission";
import { Widget } from "./shared";

// Mission proof — is the mission working. Hero = Future-Orientation lift,
// supporting = second-internship completion. Program/impact data isn't
// queryable in BloomOS yet (Phase 0 gap), so these are honest, dated, manually-
// entered figures — clearly labeled, never a fabricated computed number.

export default function MissionProofWidget({ className }: { className?: string }) {
  const m = MISSION_PROOF;

  return (
    <Widget title="Mission proof" href="/impact" hrefLabel="Impact" className={className}>
      <div className="flex items-baseline gap-3">
        <span className="font-heading font-bold text-revenue text-4xl [font-variant-numeric:tabular-nums]">{m.hero.value}</span>
        <span className="text-sm text-ink-1 font-medium">{m.hero.label}</span>
      </div>
      {m.hero.note && <p className="text-[11px] text-ink-2 mt-1">{m.hero.note}</p>}

      <div className="mt-4 pt-4 border-t border-hairline flex items-baseline gap-3">
        <span className="font-heading font-semibold text-ink-1 text-xl [font-variant-numeric:tabular-nums]">{m.secondary.value}</span>
        <span className="text-sm text-ink-2">{m.secondary.label}</span>
      </div>

      <p className="mt-4 text-[11px] text-ink-3">
        Manually entered · {m.asOf}. Program-outcome data isn&apos;t wired into BloomOS yet — update these figures in code
        until a live pipeline exists.
      </p>
    </Widget>
  );
}
