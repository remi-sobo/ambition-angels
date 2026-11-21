// Soft-credit type vocabulary. A plain module (no "use client") so the server
// donor profile and the client controls can both read it: a Server Component
// that reads a constant out of a "use client" file gets a client reference
// and throws (tests/client-boundary.test.ts).

export const SC_TYPES = [
  ["solicitor", "Solicitor"],
  ["household", "Household"],
  ["daf_advisor", "DAF advisor"],
  ["match_originator", "Match originator"],
] as const;

export const SC_TYPE_LABEL: Record<string, string> = Object.fromEntries(SC_TYPES);
