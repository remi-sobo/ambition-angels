/**
 * Semantic stage-key sets spanning every pipeline taxonomy in the system.
 *
 * The Sales pipeline runs the ten-stage HubSpot-mirrored taxonomy; the legacy
 * pipelines (Angel Connectors, retired Partnership) still run the five-stage
 * moves funnel. Peripheral consumers (briefing, overview forecast, Reed,
 * crons, today's moves) only need "is this ask open / won / lost", so they
 * filter on these unions instead of hardcoding one taxonomy's keys.
 *
 * The real source of truth is `pipeline_stages.stage_type` (per-org config;
 * see lib/fundraising/stages.ts, which the board and the opportunity APIs use
 * directly). These static unions mirror the seeded config and exist so hot
 * paths and client components don't each need a config query. When the Epic 1b
 * stage editor lets orgs add custom stages, migrate these consumers to config
 * lookups.
 *
 * Note On Hold is deliberately in no other set: it is excluded from open
 * (weighted pipeline, next-move nudges) and from won/committed (decision D2 in
 * specs/fundraising-pipeline-stages.md).
 */

/** Open asks: live work that carries weighted pipeline value. */
export const OPEN_STAGE_KEYS = [
  // Legacy five-stage funnel
  "identify",
  "qualify",
  "cultivate",
  "solicit",
  // Ten-stage Sales pipeline (pledged is open per decision D1: "committed"
  // means money actually closed)
  "identified",
  "researched",
  "needs_appointment",
  "appointment_scheduled",
  "meeting_complete",
  "ask_made",
  "pledged",
] as const;

/** Won: money closed. Legacy `steward` doubled as closed-won. */
export const WON_STAGE_KEYS = ["steward", "closed_won"] as const;

/** Lost in either taxonomy. */
export const LOST_STAGE_KEYS = ["lost", "closed_lost"] as const;

/** Parked: visible on the board, excluded from weighted and committed. */
export const ON_HOLD_STAGE_KEYS = ["on_hold"] as const;

/** Terminal (won or lost): the ask no longer needs a next move. */
export const TERMINAL_STAGE_KEYS = [...WON_STAGE_KEYS, ...LOST_STAGE_KEYS] as const;

export const isOpenStage = (stage: string): boolean =>
  (OPEN_STAGE_KEYS as readonly string[]).includes(stage);

export const isWonStage = (stage: string): boolean =>
  (WON_STAGE_KEYS as readonly string[]).includes(stage);

export const isLostStage = (stage: string): boolean =>
  (LOST_STAGE_KEYS as readonly string[]).includes(stage);

/** Won or lost — no further moves expected. */
export const isTerminalStage = (stage: string): boolean =>
  (TERMINAL_STAGE_KEYS as readonly string[]).includes(stage);

/** Cross-taxonomy funnel display order (early → late), for stage histograms
 *  that mix pipelines (e.g. the Strategy Narrative). Unknown keys sort last. */
export const STAGE_FUNNEL_ORDER = [
  "identify",
  "identified",
  "researched",
  "qualify",
  "needs_appointment",
  "cultivate",
  "appointment_scheduled",
  "meeting_complete",
  "solicit",
  "ask_made",
  "pledged",
  "steward",
  "closed_won",
  "on_hold",
  "lost",
  "closed_lost",
];

/** Short display labels for every known stage key (both taxonomies). Board
 *  columns use per-org config labels instead; this is for read-only rollups. */
export const STAGE_KEY_LABELS: Record<string, string> = {
  identify: "Identify",
  qualify: "Qualify",
  cultivate: "Cultivate",
  solicit: "Solicit",
  steward: "Steward",
  lost: "Lost",
  identified: "Identified",
  researched: "Researched",
  needs_appointment: "Needs Appointment",
  appointment_scheduled: "Appt Scheduled",
  meeting_complete: "Meeting Complete",
  ask_made: "Ask Made",
  pledged: "Pledged",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
  on_hold: "On Hold",
};

/**
 * PostgREST `.in()` needs a plain string list; these are ready-made.
 * Usage: `.in("stage", OPEN_STAGE_LIST)`.
 */
export const OPEN_STAGE_LIST: string[] = [...OPEN_STAGE_KEYS];
export const WON_STAGE_LIST: string[] = [...WON_STAGE_KEYS];
export const LOST_STAGE_LIST: string[] = [...LOST_STAGE_KEYS];
export const TERMINAL_STAGE_LIST: string[] = [...TERMINAL_STAGE_KEYS];
