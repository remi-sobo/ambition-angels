/**
 * Formats: the reusable structure of a publication (spec §6.1, §7.4a).
 *
 * A format is an ordered set of slots, stored as data per org. This module
 * holds the vocabulary, the four starter formats, and the pure operations the
 * editor performs on a slot list — so the API, the editor, and the tests all
 * agree on what a valid format is.
 *
 * The seeds use GENERIC labels on purpose. SafeSpace renames "Program
 * spotlight" to "Campus spotlight"; Young Life EPA might make it "Club
 * spotlight". Shipping one org's vocabulary as the default would make every
 * other tenant's first act a correction.
 */

export const SLOT_KINDS = ["letter", "story", "metrics", "ask", "freeform"] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];
export const isSlotKind = (v: unknown): v is SlotKind =>
  typeof v === "string" && (SLOT_KINDS as readonly string[]).includes(v);

export const CADENCES = ["monthly", "quarterly", "annual", "adhoc"] as const;
export type Cadence = (typeof CADENCES)[number];
export const isCadence = (v: unknown): v is Cadence =>
  typeof v === "string" && (CADENCES as readonly string[]).includes(v);

export type Slot = {
  /** Generated once and stable forever — historical editions reference it. */
  key: string;
  label: string;
  kind: SlotKind;
  required: boolean;
  hint?: string;
};

export const SLOT_KIND_LABEL: Record<SlotKind, string> = {
  letter: "Letter",
  story: "Story",
  metrics: "Numbers",
  ask: "Ask",
  freeform: "Free text",
};

export const SLOT_KIND_HELP: Record<SlotKind, string> = {
  letter: "The leader's own voice, first person, signed.",
  story: "Pulls from the story bank. Only consented stories can fill it.",
  metrics: "Pick metrics; their latest values render at compile.",
  ask: "The support line. Always present, never a hard ask.",
  freeform: "Anything else you want to write.",
};

export const MAX_SLOTS = 20;
export const MAX_SLOT_LABEL = 80;
export const MAX_SLOT_HINT = 240;

/**
 * A stable, readable slot key. Derived from the label on creation and then
 * frozen — renaming a slot must NOT change its key, or an edition created
 * before the rename loses its reference.
 */
export function slotKeyFrom(label: string, existing: readonly string[] = []): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "slot";
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/** Parse and clean a slot list from untrusted input. Throws on anything
 *  structurally wrong — the API turns that into a 400. */
export function parseSlots(input: unknown): Slot[] {
  if (!Array.isArray(input)) throw new Error("Slots must be a list.");
  if (input.length === 0) throw new Error("A format needs at least one slot.");
  if (input.length > MAX_SLOTS) throw new Error(`A format can have at most ${MAX_SLOTS} slots.`);

  const keys: string[] = [];
  return input.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new Error(`Slot ${i + 1} is malformed.`);
    const r = raw as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!label) throw new Error(`Slot ${i + 1} needs a label.`);
    if (!isSlotKind(r.kind)) throw new Error(`Slot "${label}" has an unknown kind.`);

    // An existing key is preserved verbatim; a new slot gets one derived from
    // its label. Never re-derive an existing key — that is the rename trap.
    const key =
      typeof r.key === "string" && r.key.trim()
        ? r.key.trim().slice(0, 40)
        : slotKeyFrom(label, keys);
    if (keys.includes(key)) throw new Error(`Two slots share the key "${key}".`);
    keys.push(key);

    const hint = typeof r.hint === "string" && r.hint.trim() ? r.hint.trim().slice(0, MAX_SLOT_HINT) : undefined;
    return {
      key,
      label: label.slice(0, MAX_SLOT_LABEL),
      kind: r.kind,
      required: r.required === true,
      ...(hint ? { hint } : {}),
    };
  });
}

/** Move a slot to a new index. Pure, so the editor's drag and the tests share
 *  one definition of what reordering means. */
export function reorderSlots(slots: readonly Slot[], from: number, to: number): Slot[] {
  if (from === to || from < 0 || to < 0 || from >= slots.length || to >= slots.length) {
    return [...slots];
  }
  const out = [...slots];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

// ── The four starter formats ────────────────────────────────────────────────
// Seeded on an org's FIRST VISIT to Comms, not at provisioning (spec §11 open
// decision 5): a tenant that never opens the module carries zero rows.

export type SeedFormat = { name: string; cadence: Cadence; slots: Slot[] };

export const SEED_FORMATS: SeedFormat[] = [
  {
    name: "Quarterly newsletter",
    cadence: "quarterly",
    slots: [
      {
        key: "letter",
        label: "Letter from the leader",
        kind: "letter",
        required: true,
        hint: "One piece of your model, personal, signed.",
      },
      {
        key: "person",
        label: "Person spotlight",
        kind: "story",
        required: true,
        hint: "A named person doing something. Needs current consent.",
      },
      {
        key: "program",
        label: "Program spotlight",
        kind: "story",
        required: false,
        hint: "What's happening in one part of the work.",
      },
      {
        key: "work",
        label: "The work",
        kind: "story",
        required: true,
        hint: "Something that happened since last time. Outcome, not output.",
      },
      { key: "numbers", label: "By the numbers", kind: "metrics", required: true },
      { key: "next", label: "What's coming", kind: "freeform", required: false },
      {
        key: "ask",
        label: "Support the work",
        kind: "ask",
        required: true,
        hint: "Always present, never a hard ask.",
      },
    ],
  },
  {
    // The between-newsletters send. Deliberately one slot: the moment it grows
    // a second, it stops feeling like a text and starts feeling like a
    // bulletin, which is the thing it exists not to be.
    name: "News flash",
    cadence: "adhoc",
    slots: [
      {
        key: "flash",
        label: "What happened",
        kind: "story",
        required: true,
        hint: "The one thing you had to tell them about. Short. Send it the same week.",
      },
      { key: "ask", label: "Support the work", kind: "ask", required: false },
    ],
  },
  {
    name: "Monthly update",
    cadence: "monthly",
    slots: [
      {
        key: "letter",
        label: "A note from the leader",
        kind: "letter",
        required: true,
        hint: "Three or four sentences, first person.",
      },
      {
        key: "work",
        label: "What happened this month",
        kind: "story",
        required: true,
        hint: "One thing, told properly, beats four things listed.",
      },
      { key: "numbers", label: "By the numbers", kind: "metrics", required: false },
      { key: "ask", label: "Support the work", kind: "ask", required: true },
    ],
  },
  {
    name: "Annual appeal letter",
    cadence: "annual",
    slots: [
      {
        key: "opening",
        label: "The opening",
        kind: "letter",
        required: true,
        hint: "Start inside one moment. No throat-clearing, no mission statement.",
      },
      {
        key: "person",
        label: "The person",
        kind: "story",
        required: true,
        hint: "One person, followed through. Needs current consent.",
      },
      {
        key: "why_now",
        label: "Why now",
        kind: "freeform",
        required: true,
        hint: "What this year asks for that last year didn't.",
      },
      { key: "numbers", label: "The year in numbers", kind: "metrics", required: false },
      {
        key: "ask",
        label: "The ask",
        kind: "ask",
        required: true,
        hint: "A specific amount for a specific thing. Vague asks raise vague money.",
      },
      { key: "close", label: "The close", kind: "letter", required: true },
    ],
  },
];

// ── Editions ────────────────────────────────────────────────────────────────

export const EDITION_STATUSES = [
  "planning",
  "drafting",
  "review",
  "compiled",
  "sent",
  "archived",
] as const;
export type EditionStatus = (typeof EDITION_STATUSES)[number];
export const isEditionStatus = (v: unknown): v is EditionStatus =>
  typeof v === "string" && (EDITION_STATUSES as readonly string[]).includes(v);

export const EDITION_STATUS_LABEL: Record<EditionStatus, string> = {
  planning: "Planned",
  drafting: "Drafting",
  review: "In review",
  compiled: "Ready to send",
  sent: "Sent",
  archived: "Archived",
};

export type FilledSlot = {
  slot_key: string;
  slot_def: Slot;
  story_id: string | null;
  metric_ids: string[] | null;
  content: string | null;
  position: number;
};

/** Is this slot actually filled? Kind decides what "filled" means — a metrics
 *  slot with no metrics picked is empty however much prose sits beside it. */
export function isSlotFilled(slot: FilledSlot): boolean {
  const hasText = !!slot.content && slot.content.trim().length > 0;
  switch (slot.slot_def.kind) {
    case "story":
      return !!slot.story_id || hasText;
    case "metrics":
      return (slot.metric_ids?.length ?? 0) > 0;
    default:
      return hasText;
  }
}

export type Completeness = {
  filled: number;
  total: number;
  requiredMissing: string[];
  /** Compile is available only when every required slot is filled. */
  canCompile: boolean;
  /** Plain text, not a gauge — the spec asks for a sentence. */
  label: string;
};

export function editionCompleteness(slots: readonly FilledSlot[]): Completeness {
  const filled = slots.filter(isSlotFilled);
  const requiredMissing = slots
    .filter((s) => s.slot_def.required && !isSlotFilled(s))
    .map((s) => s.slot_def.label);
  return {
    filled: filled.length,
    total: slots.length,
    requiredMissing,
    canCompile: slots.length > 0 && requiredMissing.length === 0,
    label: `${filled.length} of ${slots.length} slots filled`,
  };
}

// ── Plan the year ───────────────────────────────────────────────────────────

/**
 * Target dates for a year of a given cadence, from a start date.
 *
 * The point (spec §7.4) is that the deadlines exist months out, so nothing
 * gets written the week it is due. Quarterly uses the SafeSpace shape — one
 * per quarter, spaced around the fundraising calendar — rather than rigid
 * three-month arithmetic from today.
 */
export function planDates(cadence: Cadence, fromISO: string): string[] {
  const start = new Date(`${fromISO}T00:00:00Z`);
  const year = start.getUTCFullYear();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const at = (y: number, m: number, day: number) => new Date(Date.UTC(y, m, day));

  if (cadence === "adhoc") return [];

  if (cadence === "annual") {
    // The appeal lands in November, or next November if that has passed.
    const nov = at(year, 10, 1);
    return [iso(nov >= start ? nov : at(year + 1, 10, 1))];
  }

  if (cadence === "quarterly") {
    // August, November, late February, mid-May — chosen around the giving
    // calendar, not by dividing the year into four equal boxes.
    //
    // The cycle is a PROGRAM year, not a calendar one: Feb and May belong to
    // the year after the Aug/Nov that opened it. Treating all four as one
    // calendar year produced Aug, Nov, Aug, Nov — two of the four deadlines
    // silently lost.
    const cycle = (y: number): Date[] => [
      at(y, 7, 15), // mid-August
      at(y, 10, 1), // 1 November
      at(y + 1, 1, 25), // late February
      at(y + 1, 4, 15), // mid-May
    ];
    const out: string[] = [];
    // Start a year early so a spring start still catches that same May.
    for (let y = year - 1; out.length < 4 && y <= year + 2; y += 1) {
      for (const dt of cycle(y)) {
        if (dt >= start && out.length < 4) out.push(iso(dt));
      }
    }
    return out;
  }

  // monthly: the 1st of each of the next twelve months.
  const out: string[] = [];
  const first = at(year, start.getUTCMonth(), 1);
  let cursor = first >= start ? first : at(year, start.getUTCMonth() + 1, 1);
  for (let i = 0; i < 12; i += 1) {
    out.push(iso(cursor));
    cursor = at(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1);
  }
  return out;
}

/** "Fall 2026 newsletter" — a title someone would actually have typed. */
export function editionTitleFor(formatName: string, targetISO: string): string {
  const d = new Date(`${targetISO}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const season = m <= 1 || m === 11 ? "Winter" : m <= 4 ? "Spring" : m <= 7 ? "Summer" : "Fall";
  const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const lower = formatName.toLowerCase();
  if (lower.includes("quarterly") || lower.includes("newsletter")) {
    return `${season} ${y} ${formatName.replace(/^Quarterly /i, "").toLowerCase()}`;
  }
  if (lower.includes("monthly") || lower.includes("update")) return `${month} ${y} update`;
  if (lower.includes("annual") || lower.includes("appeal")) return `${y} appeal`;
  return `${formatName} — ${month} ${y}`;
}
