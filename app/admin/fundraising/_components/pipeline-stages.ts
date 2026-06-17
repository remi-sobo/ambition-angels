// Shared between the server page and the client board — no "use client",
// so the server component can iterate these directly.

export const PIPELINE_STAGES = [
  "identify", "qualify", "cultivate", "solicit", "steward",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  identify: "Identification",
  qualify: "Qualification",
  cultivate: "Cultivation",
  solicit: "Solicitation",
  steward: "Stewardship",
  lost: "Lost",
};

export type OpportunityRow = {
  id: string;
  label: string;
  constituentId: string | null;
  constituentName: string;
  hubspotId: string | null;
  stage: string;
  pipeline: string | null;
  askAmount: number | null;
  expectedClose: string | null;
  probability: number | null;
  capacityRating: number | null;
  owner: string | null;
  nextStep: string | null;
  nextStepDue: string | null;
};
