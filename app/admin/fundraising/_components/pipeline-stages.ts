// Shared between the server page and the client board — no "use client",
// so the server component can iterate these directly.
//
// Stage columns are no longer hardcoded here: the board renders whatever
// `pipeline_stages` config the server page loads via
// lib/fundraising/stages.ts (per-org, per-pipeline; ten HubSpot-mirrored
// stages for the Sales pipeline, the legacy five for the others).

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
