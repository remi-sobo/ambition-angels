/**
 * The redaction boundary for Capture transcripts (V4 §8: "transcripts follow
 * the redaction boundary before any AI call"). PURE.
 *
 * What already held before V4: the model never sees a student record (the
 * matcher never queries youth tables, tests/capture-fence.test.ts), anything
 * about a youth participant other than a story is skipped and counted
 * (youth_skipped), and the stored transcript is purged after 90 days
 * (private.capture_purge_transcripts). This adds the text step in front of
 * the one model call: contact details and identifying numbers spoken into a
 * note are masked before the transcript leaves the server. The stored
 * transcript keeps the operator's own words (it is theirs, behind RLS, and
 * purged); only the copy sent to the model is redacted.
 *
 * Masked: email addresses, phone numbers, US social security numbers, and
 * any other run of 7+ digits (account, card and routing numbers). Kept:
 * money amounts and dates, which are what a gift or task card needs.
 */

export type Redaction = { text: string; counts: { email: number; phone: number; ssn: number; number: number } };

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
// (415) 555-0134, 415-555-0134, 415.555.0134, +1 415 555 0134
const PHONE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g;
// A bare run of 7 or more digits (spaces/dashes allowed inside), not money.
const LONG_NUMBER = /(?<![$\d.,])\b\d(?:[ -]?\d){6,}\b(?![.,]\d)/g;

export function redactTranscript(input: string): Redaction {
  const counts = { email: 0, phone: 0, ssn: 0, number: 0 };
  let text = input.replace(EMAIL, () => {
    counts.email += 1;
    return "[email]";
  });
  text = text.replace(SSN, () => {
    counts.ssn += 1;
    return "[number]";
  });
  text = text.replace(PHONE, () => {
    counts.phone += 1;
    return "[phone]";
  });
  text = text.replace(LONG_NUMBER, (m) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(m)) return m; // an ISO date, not an identifier
    counts.number += 1;
    return "[number]";
  });
  return { text, counts };
}
