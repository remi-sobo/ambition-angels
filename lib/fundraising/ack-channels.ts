// Acknowledgments v2 — shared channel + subject vocabulary.
//
// One source for the API validators, the composer, the template library, and
// the donor timeline so they can never drift. Mirrors the DB check constraints
// (acknowledgments_channel_check and the subject_type checks).

export const ACK_CHANNELS = ["email", "letter", "call", "text", "in_person"] as const;
export type AckChannel = (typeof ACK_CHANNELS)[number];

// Channels handled by logging an offline touch (everything except email, which
// actually sends a message through Resend via /send).
export const OFFLINE_CHANNELS = ["letter", "call", "text", "in_person"] as const;

export const ACK_SUBJECT_TYPES = [
  "gift",
  "constituent",
  "opportunity",
  "volunteer",
  "milestone",
] as const;
export type AckSubjectType = (typeof ACK_SUBJECT_TYPES)[number];

// Title-case label for pickers and headers.
export const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  letter: "Letter",
  call: "Call",
  text: "Text",
  in_person: "In person",
  other: "Logged",
};

// Past-tense label for the donor timeline ("Emailed", "Called", …).
export const CHANNEL_PAST: Record<string, string> = {
  email: "Emailed",
  letter: "Letter sent",
  call: "Called",
  text: "Texted",
  in_person: "Thanked in person",
  other: "Thanked",
};

export const SUBJECT_TYPE_LABEL: Record<string, string> = {
  gift: "Gift",
  constituent: "Donor",
  opportunity: "Opportunity",
  volunteer: "Volunteer",
  milestone: "Milestone",
};

export function isAckChannel(v: unknown): v is AckChannel {
  return typeof v === "string" && (ACK_CHANNELS as readonly string[]).includes(v);
}

export function isOfflineChannel(v: unknown): boolean {
  return typeof v === "string" && (OFFLINE_CHANNELS as readonly string[]).includes(v);
}

export function isAckSubjectType(v: unknown): v is AckSubjectType {
  return typeof v === "string" && (ACK_SUBJECT_TYPES as readonly string[]).includes(v);
}
