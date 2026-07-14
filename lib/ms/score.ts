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
export const MAX_PER_HOLLAND_PAIR = 3; // diversity: cap profile-twins per list
export const MIN_KEEP = 5; // never floor the list below this many entries

/**
 * An occupation's dominant Holland pair ("SC", "RI", …): its two strongest
 * RIASEC letters, strongest first. Profile-twins share a pair — three
 * flavors of teaching assistant are all "SC" — and a top ten full of twins
 * is a boring reveal, so the diversity cap counts these.
 */
export function dominantPair(riasec: RiasecProfile): string {
  return RIASEC_KEYS.map((k) => [k, riasec[k]] as const)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 2)
    .map(([k]) => k)
    .join("");
}

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
  opts: { topN?: number; minAccessible?: number; maxPerPair?: number; minKeep?: number } = {}
): ScoredOccupation[] {
  const topN = opts.topN ?? DEFAULT_TOP_N;
  const minAccessible = opts.minAccessible ?? MIN_ACCESSIBLE;
  const maxPerPair = opts.maxPerPair ?? MAX_PER_HOLLAND_PAIR;
  const minKeep = opts.minKeep ?? MIN_KEEP;

  const pairBySoc = new Map(catalog.map((o) => [o.socCode, dominantPair(o.riasec)]));
  const ranked = catalog
    .map((o) => ({
      socCode: o.socCode,
      score: pearson(student, o.riasec),
      jobZone: o.jobZone,
      promoted: false,
    }))
    .sort(byRank);

  // Diversity selection: walk the ranking, admitting at most maxPerPair
  // profile-twins; deferred twins backfill only if the walk runs short, so
  // a big catalog yields ten distinct-feeling careers and a tiny one still
  // yields a full list.
  const list: ScoredOccupation[] = [];
  const deferred: ScoredOccupation[] = [];
  const pairCounts = new Map<string, number>();
  for (const o of ranked) {
    if (list.length === topN) break;
    const pair = pairBySoc.get(o.socCode) ?? "";
    const count = pairCounts.get(pair) ?? 0;
    if (count < maxPerPair) {
      list.push(o);
      pairCounts.set(pair, count + 1);
    } else {
      deferred.push(o);
    }
  }
  while (list.length < topN && deferred.length > 0) list.push(deferred.shift()!);

  // Negative-fit floor: a negative correlation is an ANTI-match, and "here's
  // what you're built for" must never say one. Drop negatives as long as
  // minKeep entries survive (below that, keep the least-bad — a sparse
  // catalog is a curation problem the coverage counter surfaces, not a
  // reason to render an empty page), then refill the freed slots with
  // non-negative careers the diversity walk had deferred.
  const nonNegative = list.filter((o) => o.score >= 0);
  const floored =
    nonNegative.length >= minKeep
      ? nonNegative
      : [...list].sort(byRank).slice(0, Math.min(list.length, Math.max(minKeep, nonNegative.length)));
  const inList = (o: ScoredOccupation) => floored.some((x) => x.socCode === o.socCode);
  for (const o of ranked) {
    if (floored.length === topN) break;
    if (o.score < 0 || inList(o)) continue;
    floored.push(o);
    const pair = pairBySoc.get(o.socCode) ?? "";
    pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
  }

  const isAccessible = (o: ScoredOccupation) => o.jobZone <= ACCESSIBLE_MAX_JOB_ZONE;

  // The Job Zone guarantee. Candidate preference: non-negative and
  // cap-respecting → non-negative → any accessible. The guarantee outranks
  // the floor by design — a kid must see reachable careers even when the
  // catalog corner is thin (and the coverage counter tells curation to fix
  // that corner properly).
  let accessibleInList = floored.filter(isAccessible).length;
  while (accessibleInList < minAccessible) {
    const pool = ranked.filter((o) => !inList(o) && isAccessible(o));
    const candidate =
      pool.find(
        (o) => o.score >= 0 && (pairCounts.get(pairBySoc.get(o.socCode) ?? "") ?? 0) < maxPerPair
      ) ??
      pool.find((o) => o.score >= 0) ??
      pool[0];
    if (!candidate) break; // no accessible career exists at all; curation owns this
    let evictIdx = -1;
    for (let i = floored.length - 1; i >= 0; i--) {
      if (!isAccessible(floored[i])) {
        evictIdx = i;
        break;
      }
    }
    if (evictIdx === -1) break; // already all-accessible (tiny catalog)
    floored.splice(evictIdx, 1);
    floored.push({ ...candidate, promoted: true });
    const pair = pairBySoc.get(candidate.socCode) ?? "";
    pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
    accessibleInList++;
  }

  return floored.sort(byRank);
}
