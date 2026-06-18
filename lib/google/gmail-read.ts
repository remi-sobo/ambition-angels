import { getGmailClient } from "./auth";

// Read side of the Gmail integration (Phase 1C.b). The existing lib/google
// only sends; this lists + fetches message metadata for logging against
// constituents. Requires the `gmail.readonly` scope on GOOGLE_REFRESH_TOKEN —
// until that scope is granted these calls return a 403 and the sync logs zero.

// Staff side of any thread: mail between two @ambitionangels.org addresses is
// internal and never logged. The counterparty is the non-staff address.
export const STAFF_DOMAIN = "ambitionangels.org";

export type ParsedMessage = {
  messageId: string;
  threadId: string;
  internalDate: number; // epoch ms
  direction: "inbound" | "outbound";
  subject: string | null;
  from: string | null; // single address
  to: string[]; // To + Cc addresses
  snippet: string; // HTML-stripped preview from Gmail
};

export function isStaffEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith("@" + STAFF_DOMAIN);
}

// Shannon is the scheduler Remi loops in on intro threads ("connecting you two,
// Shannon will find us time"). Her address is staff, so counterpartyEmails
// drops it — connection-candidate detection tests the RAW participants for her
// before that filter. Identity matches lib/admin/auth (local-part 'shannon').
export function isShannonAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  const [local, domain] = email.toLowerCase().split("@");
  return local === "shannon" && domain === STAFF_DOMAIN;
}

// Was Shannon a participant (From/To/Cc) on this message? Tests raw addresses
// (incl. staff), unlike counterpartyEmails which de-staffs.
export function shannonPresent(msg: ParsedMessage): boolean {
  return [msg.from, ...msg.to].some(isShannonAddress);
}

// Pull bare email addresses out of a raw header value
// ("Jane Doe <jane@x.org>, bob@y.org" → ["jane@x.org", "bob@y.org"]).
export function parseAddresses(header: string | null | undefined): string[] {
  if (!header) return [];
  const out: string[] = [];
  for (const part of header.split(",")) {
    const angle = part.match(/<([^>]+)>/);
    const raw = (angle ? angle[1] : part).trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) out.push(raw);
  }
  return Array.from(new Set(out));
}

// The external addresses to match against constituents (de-staffed, deduped).
export function counterpartyEmails(msg: ParsedMessage): string[] {
  const all = [msg.from, ...msg.to].filter((e): e is string => !!e);
  return Array.from(new Set(all.filter((e) => !isStaffEmail(e))));
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ",
};
function decodeSnippet(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m).trim();
}

export async function listMessageIds(opts: {
  pageToken?: string | null;
  query?: string | null;
  max?: number;
}): Promise<{ ids: string[]; nextPageToken: string | null }> {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults: opts.max ?? 100,
    pageToken: opts.pageToken ?? undefined,
    q: opts.query ?? undefined,
    includeSpamTrash: false,
  });
  const ids = (res.data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => !!id);
  return { ids, nextPageToken: res.data.nextPageToken ?? null };
}

// Metadata-only fetch: headers + Gmail's own snippet, no body download.
export async function getMessage(id: string): Promise<ParsedMessage | null> {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "metadata",
    metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
  });
  const m = res.data;
  if (!m.id) return null;
  const headers = m.payload?.headers ?? [];
  const h = (name: string): string | null =>
    headers.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value ?? null;

  const from = parseAddresses(h("From"))[0] ?? null;
  const to = [...parseAddresses(h("To")), ...parseAddresses(h("Cc"))];
  const labelIds = m.labelIds ?? [];
  // Gmail's own SENT label is authoritative for outbound; fall back to a
  // staff From for messages that lack it (e.g. some imported mail).
  const direction: "inbound" | "outbound" =
    labelIds.includes("SENT") || isStaffEmail(from) ? "outbound" : "inbound";

  return {
    messageId: m.id,
    threadId: m.threadId ?? m.id,
    internalDate: Number(m.internalDate ?? 0),
    direction,
    subject: h("Subject"),
    from,
    to,
    snippet: decodeSnippet(m.snippet ?? ""),
  };
}
