import type { OrgContext } from "@/lib/admin/auth";

/**
 * Deterministic, role-weighted status lines for the weekly rhythm (Operating
 * Rhythm v2, Phase 2). NO AI: the same counts always produce the same sentence.
 * The CONTENT is identical for everyone; the ORDER changes by role, because the
 * lead of the line is what the role should look at first —
 *
 *   owner / admin (CEO read): what slipped and what's still open lead — the
 *     moves only the principal makes.
 *   staff (ops-lead read): the queue and scheduling/follow-through lead — the
 *     coverage Shannon owns.
 *
 * Other roles fall back to the owner order. Segments carry a `flare` flag so the
 * surface can warm-color the parts that aren't calm (carryover, open hours that
 * are too tight, unclosed follow-ups) — the line is calm when calm, flares where
 * it isn't, with no color needed to read it (grayscale-safe: flare is also the
 * thing that's non-zero / low).
 */

type Role = OrgContext["role"];

export type MondayCounts = {
  /** Open (not-done) tasks that are mine this snapshot. */
  open: number;
  /** Distinct categories ("areas") among the open tasks. */
  areas: number;
  /** Tasks planned for an earlier week and still open — the rollover deck. */
  carriedOver: number;
  /** Events on the calendar this week (the meetings booked against my time). */
  meetings: number;
  /** Approximate open hours left in the working week (precise open-blocks land in P5). */
  openHours: number;
};

export type FridayCounts = {
  /** Tasks stamped planned_week = this Monday. */
  planned: number;
  /** Of the planned, how many are done. */
  done: number;
  /** Of the planned, how many are still open. */
  open: number;
  /** This-week meetings still at needs_follow_up. */
  followUpsNeeded: number;
};

export type StatusSegment = { key: string; text: string; flare: boolean };
export type WeekStatus = {
  /** Lead clause (the first segment's text), for emphasis. */
  lead: string;
  /** The full sentence, segments joined. */
  sentence: string;
  segments: StatusSegment[];
  tone: "calm" | "attention";
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function ordered(segments: StatusSegment[], order: string[]): StatusSegment[] {
  const by = new Map(segments.map((s) => [s.key, s]));
  return order.map((k) => by.get(k)).filter((s): s is StatusSegment => !!s);
}

function assemble(prefix: string, segs: StatusSegment[]): WeekStatus {
  const sentence = `${prefix} ${segs.map((s) => s.text).join(", ")}.`;
  return {
    lead: segs[0]?.text ?? "",
    sentence,
    segments: segs,
    tone: segs.some((s) => s.flare) ? "attention" : "calm",
  };
}

/** Monday "Plan" (Aim): where is my time going, and is it going to what matters. */
export function buildMondayStatus(role: Role, c: MondayCounts): WeekStatus {
  if (c.open === 0 && c.carriedOver === 0 && c.meetings === 0) {
    return {
      lead: "a clear deck",
      sentence: "This week: a clear deck — nothing planned or booked yet.",
      segments: [{ key: "empty", text: "a clear deck", flare: false }],
      tone: "calm",
    };
  }

  const segments: StatusSegment[] = [
    { key: "carried", text: `${c.carriedOver} carried over`, flare: c.carriedOver > 0 },
    {
      key: "open",
      text: `${c.open} open across ${c.areas} ${plural(c.areas, "area", "areas")}`,
      flare: false,
    },
    {
      key: "meetings",
      text: `${c.meetings} ${plural(c.meetings, "meeting", "meetings")} booked`,
      flare: false,
    },
    { key: "hours", text: `~${c.openHours}h open`, flare: c.openHours < 5 },
  ];

  const order =
    role === "staff"
      ? ["carried", "meetings", "open", "hours"] // queue + scheduling lead
      : ["open", "carried", "meetings", "hours"]; // the moves lead
  return assemble("This week:", ordered(segments, order));
}

/** Friday "Close" (Account): what's true now, and what did I fail to close. */
export function buildFridayStatus(role: Role, c: FridayCounts): WeekStatus {
  const segments: StatusSegment[] = [
    { key: "follow", text: `${c.followUpsNeeded} to follow up`, flare: c.followUpsNeeded > 0 },
    { key: "open", text: `${c.open} still open`, flare: c.open > 0 },
    { key: "done", text: `${c.done} done`, flare: false },
    { key: "planned", text: `${c.planned} planned`, flare: false },
  ];

  // Both reads lead with what didn't close; staff keeps follow-through ahead of
  // the done/planned tally a touch more, owner surfaces the open work sooner.
  const order =
    role === "staff"
      ? ["follow", "open", "planned", "done"]
      : ["follow", "open", "done", "planned"];
  return assemble("This week:", ordered(segments, order));
}
