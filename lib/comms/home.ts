/**
 * Comms Home (V4 Stage D, Comms.dc.html): the decision line and the
 * Needs-you rows, PURE so the sentence and the list can't drift apart and
 * tests can pin them.
 */

export type CommsHomeCounts = {
  /** Sends Gmail never confirmed, across campaigns (email_sends 'unknown'). */
  unknownSends: number;
  /** Campaigns holding at least one unknown send. */
  unknownCampaigns: number;
  storiesReady: number;
  storiesWaitingConsent: number;
  storiesToApprove: number;
  keptDrafts: number;
  /** Editions compiled into a draft email that has not been sent. */
  editionsReadyToSend: number;
  scheduled: number;
  /** ISO time of the next scheduled send, if any. */
  nextScheduledAt: string | null;
  /** True when the org cannot send right now (no Gmail, broken, missing address). */
  senderBlocked: string | null;
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

const whenText = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });

/** One or two plain sentences: what needs a person first, else what's next. */
export function commsDecisionLine(c: CommsHomeCounts): string {
  if (c.senderBlocked) return `Nothing can send yet: ${c.senderBlocked}`;
  if (c.unknownSends > 0) {
    return `${plural(c.unknownCampaigns, "send needs", "sends need")} a decision: we could not confirm ${plural(c.unknownSends, "email", "emails")} went out. We never resend on our own.`;
  }
  const parts: string[] = [];
  if (c.editionsReadyToSend > 0) parts.push(`${plural(c.editionsReadyToSend, "edition is", "editions are")} ready to review and send.`);
  if (c.storiesWaitingConsent > 0) parts.push(`${plural(c.storiesWaitingConsent, "story is", "stories are")} waiting on consent.`);
  if (c.nextScheduledAt) parts.push(`Next send goes ${whenText(c.nextScheduledAt)}.`);
  if (parts.length > 0) return parts.slice(0, 2).join(" ");
  if (c.storiesReady > 0) return `${plural(c.storiesReady, "story is", "stories are")} ready to use. Start an edition when you're ready.`;
  return "Nothing needs you in Comms. Capture a story when you hear one.";
}

export type NeedsYouRow = {
  key: string;
  title: string;
  why: string;
  href: string;
  action: string;
  tone: "danger" | "warning" | "neutral";
};

/** The Needs-you list, most urgent first. */
export function commsNeedsYou(c: CommsHomeCounts, links: { unknownHref: string | null }): NeedsYouRow[] {
  const rows: NeedsYouRow[] = [];
  if (c.unknownSends > 0) {
    rows.push({
      key: "unknown",
      title: `${plural(c.unknownSends, "email", "emails")} we could not confirm`,
      why: "Gmail did not answer. Decide for each one; nothing is resent on its own, so no donor gets the same email twice.",
      href: links.unknownHref ?? "/admin/comms/emails",
      action: "Review",
      tone: "danger",
    });
  }
  if (c.editionsReadyToSend > 0) {
    rows.push({
      key: "ready",
      title: `${plural(c.editionsReadyToSend, "edition", "editions")} ready to send`,
      why: "Compiled into an email draft. Check the audience and count, send a test, then send from Emails.",
      href: "/admin/comms/emails",
      action: "Review",
      tone: "warning",
    });
  }
  if (c.keptDrafts > 0) {
    rows.push({
      key: "kept",
      title: `${plural(c.keptDrafts, "story draft", "story drafts")} from Talk to log`,
      why: "Kept before the story bank existed. Move them in; each stays held until consent is on file.",
      href: "/admin/comms/stories?moved=capture",
      action: "Move into stories",
      tone: "neutral",
    });
  }
  if (c.storiesWaitingConsent > 0) {
    rows.push({
      key: "consent",
      title: `${plural(c.storiesWaitingConsent, "story", "stories")} waiting on consent`,
      why: "They name or show a participant. They can't be used until a guardian's consent is on file.",
      href: "/admin/comms/stories?consent=waiting",
      action: "See stories",
      tone: "warning",
    });
  }
  if (c.storiesToApprove > 0) {
    rows.push({
      key: "approve",
      title: `${plural(c.storiesToApprove, "story", "stories")} to read and approve`,
      why: "A person approves every story before it can go in an email.",
      href: "/admin/comms/stories?status=raw",
      action: "Read",
      tone: "neutral",
    });
  }
  return rows;
}
