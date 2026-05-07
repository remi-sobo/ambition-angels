export type ProspectScore = {
  hubspot_contact_id: string;
  score_capacity: number | null;
  score_likelihood: number | null;
  score_alignment: number | null;
  score_relationship: number | null;
  score_strategic_leverage: number | null;
  score_stage_fit: number | null;
  score_energy_suck: number | null;
  score_total: number | null;
  notes: string | null;
  scored_by: "remi" | "shannon" | null;
  scored_at: string | null;
};

const DIMENSIONS: Array<{
  key: Exclude<keyof ProspectScore, "hubspot_contact_id" | "score_total" | "notes" | "scored_by" | "scored_at">;
  label: string;
}> = [
  { key: "score_capacity", label: "Capacity" },
  { key: "score_likelihood", label: "Likelihood to Give" },
  { key: "score_alignment", label: "Alignment" },
  { key: "score_relationship", label: "Relationship" },
  { key: "score_strategic_leverage", label: "Strategic Leverage" },
  { key: "score_stage_fit", label: "Stage Fit" },
  { key: "score_energy_suck", label: "Energy Suck" },
];

function fmtAbsolute(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function cap(s: string | null): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ScorePanel({ score }: { score: ProspectScore | null }) {
  return (
    <section className="rounded-card border border-white/10 bg-black/30 p-6">
      <h2 className="text-xs uppercase tracking-wider text-gray-mid mb-4">
        Prospect Score
      </h2>

      {!score ? (
        <p className="text-sm text-cream/70">
          Not yet scored.{" "}
          <span className="text-gray-mid">
            Scoring UI coming in next release.
          </span>
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {DIMENSIONS.map(({ key, label }) => {
              const v = score[key];
              return (
                <div
                  key={key}
                  className="rounded-lg border border-white/5 bg-white/5 px-3 py-2"
                >
                  <div className="text-[10px] uppercase tracking-wider text-gray-mid">
                    {label}
                  </div>
                  <div className="font-display font-bold text-cream text-2xl leading-none mt-1">
                    {typeof v === "number" ? v : "—"}
                    <span className="text-xs text-gray-mid font-body font-normal">
                      {typeof v === "number" ? " / 10" : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t border-white/5 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs">
            <div>
              <span className="text-gray-mid uppercase tracking-wider">Total</span>{" "}
              <span className="font-display font-bold text-orange text-xl ml-1 align-middle">
                {score.score_total ?? 0}
              </span>{" "}
              <span className="text-gray-mid">/ 70</span>
            </div>
            <div className="text-gray-mid">
              Scored by <span className="text-cream">{cap(score.scored_by)}</span> ·{" "}
              <span className="text-cream">{fmtAbsolute(score.scored_at)}</span>
            </div>
          </div>

          {score.notes && (
            <div className="mt-4 text-sm text-cream/80 leading-relaxed whitespace-pre-wrap">
              {score.notes}
            </div>
          )}
        </>
      )}
    </section>
  );
}
