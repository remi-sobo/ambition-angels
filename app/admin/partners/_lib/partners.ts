// Plain (non-"use client") shared partner constants + types. Lives in a
// server-safe module so Server Components (the list + profile pages) can
// import these VALUES directly. Importing a non-component value out of a
// "use client" module into a Server Component breaks in the production
// bundle ("Cannot access … before initialization"), so KIND_LABELS /
// inputCls / the Partner type live here, not in PartnerControls.

export type Partner = {
  id: string;
  name: string;
  kind: string;
  status: string;
  city: string | null;
  region: string | null;
  domain: string | null;
  priority_score: number | null;
  score_factors: Record<string, number> | null;
  champion_name: string | null;
  champion_email: string | null;
  teen_count: string | null;
  program_type: string | null;
  mou_status: string;
  mou_start: string | null;
  mou_end: string | null;
  data_agreement_signed: string | null;
  referral: string | null;
  notes: string | null;
  last_touch_at: string | null;
  external_source: string | null;
  // Derived (joined in the page query), not columns:
  contact_count?: number;
  primary_contact?: string | null;
};

export const KIND_LABELS: Record<string, string> = {
  school: "School",
  district: "District",
  nonprofit: "Nonprofit",
  company: "Company",
  other: "Other",
};

export const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";
