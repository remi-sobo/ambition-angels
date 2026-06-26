/**
 * HubSpot dealstage → BloomOS moves-funnel mapping (single source for the UI).
 *
 * MUST stay in sync with the SQL functions `fr_map_dealstage` /
 * `fr_stage_probability` in
 * supabase/migrations/create_fr_hubspot_sync_function.sql. If you change a
 * mapping in one place, change it in both.
 *
 * Background: HubSpot runs three pipelines with 26 raw stages. BloomOS shows a
 * single moves-management funnel (identify → steward, plus lost). This module
 * translates the raw HubSpot stage/pipeline ids into the funnel and the labels
 * the fundraiser sees.
 */

export type MovesStage =
  | "identify"
  | "qualify"
  | "cultivate"
  | "solicit"
  | "steward"
  | "lost";

/** Raw HubSpot dealstage id → moves-funnel stage. */
export const DEALSTAGE_TO_MOVES: Record<string, MovesStage> = {
  // Identification
  "68574501": "identify", // Identified (Sales)
  "117779885": "identify", // Prospective Partner
  "1060753811": "identify", // Identified (Angel)
  "1060753814": "identify", // Big 3 ID'd
  "1060753815": "identify", // LinkedIn Mined
  // Qualification
  "3448542949": "qualify", // Researched
  "59213864": "qualify", // Needs Appointment
  // Cultivation
  appointmentscheduled: "cultivate",
  "3448542951": "cultivate", // On Hold
  "117779886": "cultivate", // Meeting Scheduled
  "117779887": "cultivate", // Needs Follow-Up
  "1060753812": "cultivate", // Pitched
  "1060753816": "cultivate", // Outreach Sent
  "1060753817": "cultivate", // Meetings Scheduled w/ Connections
  // Solicitation
  "3448504042": "solicit", // Meeting Complete/Ready for Ask
  "68574502": "solicit", // Ask Made
  "1063539272": "solicit", // Proposed
  "1064297317": "solicit", // Pending MOU Approval
  // Stewardship
  "59189578": "steward", // Pledged — donor has committed; ask succeeded
  "3448542950": "steward", // AIG Member
  closedwon: "steward",
  "117779888": "steward", // Partnership Established
  "117779889": "steward", // Post-partnership Follow-Up
  "1060753813": "steward", // Committed
  // Lost
  closedlost: "lost",
  "117779890": "lost", // Not Interested
};

/** Map a raw HubSpot dealstage id to a funnel stage (defaults to cultivate). */
export function mapDealStage(hsStage: string | null | undefined): MovesStage {
  if (!hsStage) return "cultivate";
  return DEALSTAGE_TO_MOVES[hsStage] ?? "cultivate";
}

/** Default close-probability per funnel stage, used for weighted pipeline. */
export const STAGE_PROBABILITY: Record<MovesStage, number> = {
  identify: 10,
  qualify: 25,
  cultivate: 40,
  solicit: 75,
  steward: 100,
  lost: 0,
};

/** HubSpot pipeline id → human label. `default` is the fundraising pipeline. */
export const HUBSPOT_PIPELINES: Record<string, string> = {
  default: "Sales Pipeline",
  "59855776": "Partnership Pipeline",
  "727459407": "Angel Connectors",
};

/** The pipeline a fundraiser cares about by default (major-gifts money). */
export const FUNDRAISING_PIPELINE_ID = "default";
