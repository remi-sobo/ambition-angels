/**
 * Picks the applier for a card (specs/bloomos-capture.md, C3). Never a
 * student: entity_type is constrained to constituent | partner by the C1
 * check, and anything else is refused here too.
 */

import { draftApplier } from "./draft";
import { interactionApplier } from "./interactions";
import { partnerInteractionApplier } from "./partnerInteraction";
import { ApplyError, type Applier, type AppliedTable, type CardRow } from "./shared";
import { taskApplier } from "./task";

export * from "./shared";

export function applierFor(card: Pick<CardRow, "dest" | "entity_type" | "entity_id">): Applier {
  switch (card.dest) {
    case "interaction":
      if (card.entity_type === "constituent" && card.entity_id) return interactionApplier;
      if (card.entity_type === "partner" && card.entity_id) return partnerInteractionApplier;
      throw new ApplyError(409, "Pick a match first.");
    case "task":
    case "thought":
      return taskApplier;
    case "message_draft":
      return draftApplier;
    default:
      throw new ApplyError(422, "Unknown card destination.");
  }
}

const BY_TABLE: Record<AppliedTable, Applier> = {
  interactions: interactionApplier,
  partner_interactions: partnerInteractionApplier,
  ops_tasks: taskApplier,
  reed_drafts: draftApplier,
};

/** The applier that wrote a confirmed card's row, by the table it recorded. */
export function applierForTable(table: AppliedTable | null): Applier {
  if (!table || !BY_TABLE[table]) throw new ApplyError(409, "This card was not filed anywhere.");
  return BY_TABLE[table];
}
