// Reed "next move" per constituent/prospect: one grounded suggestion — what to
// do next with this specific person, why, and (when the move is an email) a
// ready-to-send draft. The dossier is everything BloomOS already knows; the
// agent never invents facts and never sends anything itself.

export type NextMoveChannel = "email" | "call" | "meeting" | "note" | "wait" | "other";

export type NextMoveEntityType = "constituent" | "fr_prospects";

/** Everything the route assembles about one person for the agent to reason over. */
export type NextMoveDossier = {
  entityType: NextMoveEntityType;
  entityId: string;
  name: string;
  /** person | organization | foundation | corporate */
  kind: string;
  email: string | null;
  doNotContact: boolean;
  tags: string[];
  notes: string | null;

  // Giving (constituents; empty for bench prospects)
  lifetimeGiving: number;
  giftCount: number;
  gifts: Array<{ date: string; amount: number; method: string | null }>;
  activeRecurring: boolean;
  retentionFlags: string[]; // human labels: "LYBUNT", "Off their rhythm", ...
  engagementScore: number | null;
  lastThankedAt: string | null;

  // Conversations — newest first, already trimmed by the route
  interactions: Array<{
    date: string;
    kind: string; // email | call | meeting | note
    direction: string | null; // inbound | outbound | null
    summary: string; // subject and/or preview/notes
  }>;

  // Pipeline
  openAsks: Array<{ stage: string; askAmount: number | null; nextStep: string | null; nextStepDue: string | null }>;
  openTasks: Array<{ title: string; dueDate: string | null }>;

  // Research (funder-research brief excerpt when one exists)
  researchExcerpt: string | null;
  /** Prospect-only extras: score, lifecycle, strategy note. */
  prospectContext: string | null;
};

/** What the agent returns (already coerced/validated by parseNextMove). */
export type NextMoveSuggestion = {
  action: string;
  rationale: string;
  channel: NextMoveChannel;
  dueInDays: number;
  emailSubject: string | null;
  emailBody: string | null;
};

/** Persisted row shape the panel consumes. */
export type NextMoveRecord = NextMoveSuggestion & {
  id: string;
  generatedAt: string;
  model: string;
};
