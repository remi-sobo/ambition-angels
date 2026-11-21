// Shared compliance vocabulary. A plain module (no "use client") so the
// server item page and the client controls can both read these values: a
// Server Component that reads a constant out of a "use client" file gets a
// client reference and throws (tests/client-boundary.test.ts).

export const KIND_LABELS: Record<string, string> = {
  form_990: "IRS 990",
  state_charitable: "Charitable reg.",
  corporate_report: "Corporate",
  employment_tax: "Payroll tax",
  insurance: "Insurance",
  policy: "Policy",
  public_disclosure: "Disclosure",
  contract: "Contract",
  custom: "Custom",
};

export const RECUR_OPTIONS: Array<[string, string]> = [
  ["annual", "Annually"],
  ["quarterly", "Quarterly"],
  ["biennial", "Every 2 years"],
  ["none", "One-time"],
];
