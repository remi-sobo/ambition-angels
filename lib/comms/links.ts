/**
 * Links in a campaign's plain-text body (specs/comms-v2-gmail-amendment.md
 * G3). The renderer and the click route both call extractLinks on the same
 * personalized body, so link n in the email is link n in the redirect: the
 * redirect target always comes from the stored campaign, never the request,
 * so the route can't be used as an open redirect.
 */

const URL_RE = /https?:\/\/[^\s<>"']+/g;
// Sentence punctuation that commonly trails a pasted link.
const TRAILING = /[.,;:!?)\]]+$/;

export type Segment = { kind: "text"; text: string } | { kind: "link"; url: string; index: number };

/** Split text into plain runs and links, numbering links in order. */
export function segmentLinks(text: string, startIndex = 0): { segments: Segment[]; next: number } {
  const segments: Segment[] = [];
  let index = startIndex;
  let last = 0;
  const re = new RegExp(URL_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const url = raw.replace(TRAILING, "");
    const at = m.index ?? 0;
    if (at > last) segments.push({ kind: "text", text: text.slice(last, at) });
    segments.push({ kind: "link", url, index });
    index += 1;
    last = at + url.length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return { segments, next: index };
}

/** Every link in the body, in order. */
export function extractLinks(text: string): string[] {
  return segmentLinks(text)
    .segments.filter((s): s is Extract<Segment, { kind: "link" }> => s.kind === "link")
    .map((s) => s.url);
}

/** A tracking token: 24 random bytes, URL-safe. */
export function newTrackingToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export const isTrackingToken = (v: string) => /^[A-Za-z0-9_-]{32}$/.test(v);
