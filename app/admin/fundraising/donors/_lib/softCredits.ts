// Plain (non-"use client") soft-credit constants. DonorProfile (a Server
// Component) indexes into SC_TYPE_LABEL, which breaks in the production bundle
// when it lives in a "use client" module — same reason as
// app/admin/partners/_lib/partners.ts.

export const SC_TYPES = [
  ["solicitor", "Solicitor"],
  ["household", "Household"],
  ["daf_advisor", "DAF advisor"],
  ["match_originator", "Match originator"],
] as const;

export const SC_TYPE_LABEL: Record<string, string> = Object.fromEntries(SC_TYPES);
