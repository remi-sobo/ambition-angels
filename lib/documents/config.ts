// Documents system constants (spec #2). Server-side enforcement only — the
// client may mirror these for UX, but the API routes are the gate.

/** Size cap, matching the proven bloomos-asks limit. */
export const MAX_DOC_BYTES = 25 * 1024 * 1024; // 25 MB

/** Mime allowlist → canonical extension. Superset of the asks list (adds
 * PowerPoint, CSV, and plain text — board packets and budgets need them). */
export const DOC_EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/csv": "csv",
  "text/plain": "txt",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export const isAllowedDocMime = (mime: string): boolean =>
  Object.prototype.hasOwnProperty.call(DOC_EXT_BY_MIME, mime);

/** Document type vocabulary — data for filters/chips, not a DB constraint,
 * so a new type is a one-line change here. */
export const DOC_TYPES = [
  "award_letter",
  "mou",
  "board_packet",
  "minutes",
  "policy",
  "report",
  "grant_narrative",
  "receipt",
  "insurance",
  "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** Types whose documents expire and belong in the renewal queue — the upload
 * forms only offer an expiration date for these. */
export const EXPIRING_DOC_TYPES: readonly string[] = ["insurance"];
export const docTypeExpires = (t: string): boolean => EXPIRING_DOC_TYPES.includes(t);

/** Earliest valid expiration date: tomorrow, in the caller's timezone.
 * Expirations must be future dates — a document that expires today or earlier
 * is already expired, so it isn't accepted as a new expiry. */
export const minExpirationISO = (now: Date = new Date()): string => {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const DOC_TYPE_LABEL: Record<string, string> = {
  award_letter: "Award letter",
  mou: "MOU",
  board_packet: "Board packet",
  minutes: "Minutes",
  policy: "Policy",
  report: "Report",
  grant_narrative: "Grant narrative",
  receipt: "Receipt",
  insurance: "Insurance",
  other: "Other",
};

/** "Expiring soon" window for the hub view (the renewal queue arm carries the
 * raw expiry and lets due-date ranking handle urgency). */
export const EXPIRING_WINDOW_DAYS = 60;

export const DOCUMENTS_BUCKET = "bloomos-documents";

/** Signed URLs: minted per request, never stored (see spec failure mode #1). */
export const SIGNED_URL_TTL_SECONDS = 60 * 5;

/** Keep only path-safe characters so the storage key can't be abused. */
export function safeFilename(name: string): string {
  const trimmed = name.trim().slice(0, 140) || "document";
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
}
