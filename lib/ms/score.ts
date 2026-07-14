import { RIASEC_KEYS, type RiasecProfile } from "./riasec";

/**
 * The /ms scorer (specs/ms-career-library-v2.md "The scorer").
 *
 * Deterministic, no model in the matching path, ever. Matches on the SHAPE
 * of the interest profile: Pearson correlation between the student's six
 * RIASEC scores and each occupation's six, so an occupation with the same
 * pattern of highs and lows wins over one that simply scores high on
 * everything.
 *
 * Then the accessibility guarantee: every result list contains at least
 * MIN_ACCESSIBLE careers in Job Zone 1–3 (reachable without a four-year
 * degree). That is the thesis, not a nicety — the promotion rule below is
 * deterministic and documented because it is the part of the scorer a
 * school district will ask about.
 */

export type ScorableOccupation = {
  socCode: string;
  riasec: RiasecProfile;
  jobZone: number;
};

export type ScoredOccupation = {
  socCode: string;
  /** Pearson correlation in [-1, 1]; 0 when either profile is flat. */
  score: number;
  jobZone: number;
  /** True when this entry was pulled up by the Job Zone guarantee. */
  promoted: boolean;
};

export const DEFAULT_TOP_N = 10;
export const MIN_ACCESSIBLE = 3; // Job Zone 1–3 slots guaranteed per list
export const ACCESSIBLE_MAX_JOB_ZONE = 3;

/**
 * Pearson correlation across the six dimensions, in fixed key order.
 *
 * Flat-profile rule: when either side has zero variance (a student who taps
 * the same answer on everything, or a degenerate occupation row), the
 * correlation is undefined — we define it as 0 rather than dropping the
 * pair, so ranking falls through to the deterministic tie-break and the
 * student still gets a stable, Job-Zone-diverse list instead of an error.
 */
export function pearson(a: RiasecProfile, b: RiasecProfile): number {
  const xs = RIASEC_KEYS.map((k) => a[k]);
  const ys = RIASEC_KEYS.map((k) => b[k]);
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return 0;
  return cov / Math.sqrt(varX * varY);
}

/**
 * Stable ordering: score desc, then Job Zone asc (when scores tie, favor the
 * more accessible career), then SOC code asc. Same input, same list, always.
 */
function byRank(a: ScoredOccupation, b: ScoredOccupation): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.jobZone !== b.jobZone) return a.jobZone - b.jobZone;
  return a.socCode < b.socCode ? -1 : a.socCode > b.socCode ? 1 : 0;
}

/**
 * Rank the catalog for one student and apply the accessibility guarantee.
 *
 * Promotion rule, deterministic: rank everything by correlation. Take the
 * top N. While the list holds fewer than MIN_ACCESSIBLE careers in Job Zone
 * 1–3 and accessible careers remain outside it, remove the lowest-ranked
 * non-accessible entry and add the highest-ranked accessible one not yet in
 * the list. The final list is re-sorted by rank, so a promoted career sits
 * wherever its own correlation puts it — membership changes, order does not
 * lie about fit. Promoted entries are flagged for telemetry.
 *
 * If the whole catalog has fewer than MIN_ACCESSIBLE accessible careers,
 * every one of them is included and the list is otherwise unchanged — the
 * guarantee cannot invent rows; catalog curation owns that spread.
 */
export function rankCareers(
  student: RiasecProfile,
  catalog: ScorableOccupation[],
  opts: { topN?: number; minAccessible?: number } = {}
): ScoredOccupation[] {
  const topN = opts.topN ?? DEFAULT_TOP_N;
  const minAccessible = opts.minAccessible ?? MIN_ACCESSIBLE;

  const ranked = catalog
    .map((o) => ({
      socCode: o.socCode,
      score: pearson(student, o.riasec),
      jobZone: o.jobZone,
      promoted: false,
    }))
    .sort(byRank);

  const list = ranked.slice(0, topN);
  const rest = ranked.slice(topN);
  const isAccessible = (o: ScoredOccupation) => o.jobZone <= ACCESSIBLE_MAX_JOB_ZONE;

  let accessibleInList = list.filter(isAccessible).length;
  while (accessibleInList < minAccessible) {
    const candidate = rest.find(isAccessible);
    if (!candidate) break; // catalog itself lacks the spread; nothing to promote
    // Evict the lowest-ranked non-accessible entry to make room.
    let evictIdx = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!isAccessible(list[i])) {
        evictIdx = i;
        break;
      }
    }
    if (evictIdx === -1) break; // list is all-accessible already (tiny catalog)
    list.splice(evictIdx, 1);
    rest.splice(rest.indexOf(candidate), 1);
    list.push({ ...candidate, promoted: true });
    accessibleInList++;
  }

  return list.sort(byRank);
}
