/**
 * The six RIASEC dimensions (Holland, 1959) that underlie the /ms trait
 * model, and the kid-facing trait names that map onto them 1:1
 * (specs/ms-career-library-v2.md "The insight").
 *
 * Occupation profiles come from O*NET (Interests, OI scale) via
 * scripts/import-onet.ts. Student profiles come from the /ms instrument:
 * items are tagged to a dimension, responses sum per dimension.
 */

export const RIASEC_KEYS = ["R", "I", "A", "S", "E", "C"] as const;
export type RiasecKey = (typeof RIASEC_KEYS)[number];

/** Six numeric scores keyed R/I/A/S/E/C. Scale-free: the scorer matches on shape. */
export type RiasecProfile = Record<RiasecKey, number>;

/** Kid-facing trait → RIASEC dimension. */
export const TRAIT_TO_RIASEC = {
  build: "R",
  analyze: "I",
  create: "A",
  help: "S",
  lead: "E",
  organize: "C",
} as const;

export type TraitKey = keyof typeof TRAIT_TO_RIASEC;

/** Student trait vector in kid-facing names (what the instrument produces). */
export type TraitProfile = Record<TraitKey, number>;

export function traitsToRiasec(traits: TraitProfile): RiasecProfile {
  const out = {} as RiasecProfile;
  for (const [trait, key] of Object.entries(TRAIT_TO_RIASEC)) {
    out[key as RiasecKey] = traits[trait as TraitKey];
  }
  return out;
}

/** Parse a jsonb riasec column defensively; throws on a malformed profile. */
export function asRiasecProfile(value: unknown): RiasecProfile {
  if (!value || typeof value !== "object") throw new Error("riasec profile is not an object");
  const obj = value as Record<string, unknown>;
  const out = {} as RiasecProfile;
  for (const key of RIASEC_KEYS) {
    const n = obj[key];
    if (typeof n !== "number" || !Number.isFinite(n)) {
      throw new Error(`riasec profile missing numeric ${key}`);
    }
    out[key] = n;
  }
  return out;
}
