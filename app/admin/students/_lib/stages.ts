// Shared between the server page and the client controls — no "use client",
// so the server component can iterate these directly (importing values from
// a client module crashes server components at request time).

export const JOURNEY_STAGES = [
  "discover", "learn", "practice", "connect", "launch",
] as const;

export const STAGE_ORDER = [
  ...JOURNEY_STAGES, "alumni", "withdrawn",
] as const;

// Labels + descriptions mirror the AA participant_stages seed. Client-safe
// fallback only — the DB rows (per org, with descriptions) drive the live UI.
export const STAGE_LABELS: Record<string, string> = {
  discover: "New",
  learn: "Exploring",
  practice: "Practicing",
  connect: "Connecting",
  launch: "Launched",
  alumni: "Alumni",
  withdrawn: "Inactive",
};

export const STAGE_DESCRIPTIONS: Record<string, string> = {
  discover: "Just joined — getting oriented, not yet actively engaged.",
  learn: "Exploring careers and building future-orientation through the app and sessions.",
  practice: "Hands-on — practicing and applying real skills and tasks.",
  connect: "Being matched with and meeting a trusted adult or mentor.",
  launch: "Reached a real opportunity — an internship, program, or placement.",
  alumni: "Completed the journey; part of the alumni community.",
  withdrawn: "No longer participating — paused, left, or unreachable.",
};
