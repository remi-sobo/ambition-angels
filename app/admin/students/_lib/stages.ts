// Shared between the server page and the client controls — no "use client",
// so the server component can iterate these directly (importing values from
// a client module crashes server components at request time).

export const JOURNEY_STAGES = [
  "discover", "learn", "practice", "connect", "launch",
] as const;

export const STAGE_ORDER = [
  ...JOURNEY_STAGES, "alumni", "withdrawn",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  discover: "Discover",
  learn: "Learn",
  practice: "Practice",
  connect: "Connect",
  launch: "Launch",
  alumni: "Alumni",
  withdrawn: "Withdrawn",
};
