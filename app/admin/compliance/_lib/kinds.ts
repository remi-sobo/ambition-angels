// Plain (non-"use client") compliance constants. The item page (a Server
// Component) indexes into KIND_LABELS, which breaks in the production bundle
// when it lives in a "use client" module — same reason as
// app/admin/partners/_lib/partners.ts.

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
