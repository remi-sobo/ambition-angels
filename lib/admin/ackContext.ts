import { escalationsFor, evaluateStewardship, type StewardshipRule } from "@/lib/fundraising/stewardship";
import { IRS_SUBSTANTIATION_THRESHOLD } from "@/lib/fundraising/receipt";
import { ackDueDate, ackDonorName, giftOrdinals } from "@/lib/admin/todayAck";
import { CHANNEL_LABEL } from "@/lib/fundraising/ack-channels";

/**
 * The acknowledgment panel's payload (specs/needs-you-popout-thank-yous.md,
 * PR 3). PURE: GET /api/admin/acknowledgments/context loads the rows (org
 * fenced) and this shapes them; tests feed it fixtures.
 *
 * The recommendation comes from the org's stewardship matrix, not a constant:
 * the primary rule's channel and SLA, plus "major" when an escalate rule
 * matches (AA: $1,000 and up, a personal touch from the escalation owner
 * before or instead of email). A donor's own preferred_ack_channel wins over
 * the rule's channel.
 */

export type AckContextGift = {
  id: string;
  amount: number;
  gift_date: string;
  method: string;
  external_source: string | null;
  recurring_plan_id: string | null;
  notes: string | null;
  acknowledgment_status: string;
  constituent_id: string | null;
};

export type AckContextDonor = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  emails: string[] | null;
  preferred_ack_channel: string | null;
  do_not_contact: boolean | null;
  why_matters: string | null;
};

export type AckContext = {
  giftId: string;
  status: string;
  amount: number;
  giftDate: string;
  dueDate: string;
  sourceLabel: string;
  notes: string | null;
  campaign: string | null;
  fund: string | null;
  appeal: string | null;
  receiptRequired: boolean;
  donor: {
    id: string | null;
    name: string;
    firstName: string | null;
    isOrganization: boolean;
    email: string | null;
    doNotContact: boolean;
    whyMatters: string | null;
  };
  history: {
    ordinal: number;
    lifetimeCount: number;
    lifetimeTotal: number;
    previous: { date: string; amount: number } | null;
  };
  recommendation: {
    channel: string;
    channelLabel: string;
    /** Where the channel came from, said plainly in the panel. */
    basis: "donor preference" | "stewardship rule" | "default";
    ruleName: string | null;
    major: boolean;
    escalationOwner: string | null;
  };
};

const SOURCE_LABEL: Record<string, string> = {
  hubspot_deal: "HubSpot",
  stripe: "Stripe",
  manual: "Entered in BloomOS",
  pledge: "Pledge payment",
  donor_master: "Imported",
};

export function sourceLabel(src: string | null): string {
  if (!src) return "Entered in BloomOS";
  return SOURCE_LABEL[src] ?? src;
}

export function buildAckContext(input: {
  gift: AckContextGift;
  donor: AckContextDonor | null;
  /** Every gift by this donor (org-fenced), this one included. */
  history: { id: string; gift_date: string; amount: number }[];
  rules: StewardshipRule[];
  names: { campaign: string | null; fund: string | null; appeal: string | null };
}): AckContext {
  const { gift, donor, history, rules, names } = input;
  const ordinals = giftOrdinals(history.map((h) => ({ ...h, constituent_id: gift.constituent_id })));
  const ordinal = ordinals.get(gift.id) ?? 1;
  const earlier = history
    .filter((h) => h.id !== gift.id && (ordinals.get(h.id) ?? 0) < ordinal)
    .sort((a, b) => (ordinals.get(b.id) ?? 0) - (ordinals.get(a.id) ?? 0));
  const facts = {
    amount: gift.amount,
    method: gift.method,
    gift_date: gift.gift_date,
    external_source: gift.external_source,
    recurring: Boolean(gift.recurring_plan_id),
    isFirstGift: ordinal === 1,
    ageDays: 0,
  };
  const decision = evaluateStewardship(facts, rules);
  const escalations = escalationsFor(facts, rules);
  const preferred = donor?.preferred_ack_channel?.trim() || null;
  const ruleChannel = decision.ruleId ? decision.channel : null;
  const channel = preferred ?? ruleChannel ?? "email";

  return {
    giftId: gift.id,
    status: gift.acknowledgment_status,
    amount: gift.amount,
    giftDate: gift.gift_date,
    dueDate: ackDueDate(
      { ...gift, constituent: null },
      rules,
      ordinal,
    ),
    sourceLabel: sourceLabel(gift.external_source),
    notes: gift.notes?.trim() || null,
    campaign: names.campaign,
    fund: names.fund,
    appeal: names.appeal,
    receiptRequired: gift.amount >= IRS_SUBSTANTIATION_THRESHOLD,
    donor: {
      id: donor?.id ?? null,
      name: donor ? ackDonorName(donor) : "Unnamed donor",
      firstName: donor?.type === "organization" ? null : donor?.first_name?.trim() || null,
      isOrganization: donor?.type === "organization",
      email: (donor?.emails ?? []).map((e) => e?.trim()).find(Boolean) ?? null,
      doNotContact: donor?.do_not_contact === true,
      whyMatters: donor?.why_matters?.trim() || null,
    },
    history: {
      ordinal,
      lifetimeCount: history.length,
      lifetimeTotal: history.reduce((s, h) => s + h.amount, 0),
      previous: earlier[0] ? { date: earlier[0].gift_date, amount: earlier[0].amount } : null,
    },
    recommendation: {
      channel,
      channelLabel: CHANNEL_LABEL[channel] ?? channel,
      basis: preferred ? "donor preference" : ruleChannel ? "stewardship rule" : "default",
      ruleName: decision.ruleId ? decision.ruleName : null,
      major: escalations.length > 0,
      escalationOwner: escalations[0]?.assignee ?? null,
    },
  };
}
