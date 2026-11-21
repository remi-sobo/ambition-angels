/**
 * V4 Stage F: the five-step setup checklist on Home (spec §11, prototype
 * Setup.dc.html). PURE: the server loader (setupChecklist-server.ts) reads
 * the facts from real data; tests feed fixtures.
 *
 * Completion rules (no manual ticks; the only manual control is "Finish
 * later", which hides the list for the org):
 *   1. Confirm your organization: legal name, a full mailing address and a
 *      valid EIN are in orgs.settings.
 *   2. Invite a teammate: the org has two or more members (an open invite
 *      counts; the invited person appears in People and roles).
 *   3. Connect Gmail: the org's Gmail sender is connected and active. Not
 *      needed (counted done) when Comms is off.
 *   4. Bring in your donors: a donor or gift import finished and created at
 *      least one record (and was not undone), or the org already holds 25 or
 *      more donor records. Not needed when Fundraising is off.
 *   5. Record a first gift or talk to log: at least one gift, or one Talk to
 *      log capture filed to the end. Not needed when both Fundraising and
 *      Talk to log are off.
 * The panel shows for owners and admins (org.manage) until all five are done
 * or it is dismissed. An action href of "#capture" opens Talk to log.
 */

export type SetupFacts = {
  identityComplete: boolean;
  /** "Harbor Youth Collective · 88 Wharf Street, Portland, ME 04101 · EIN 12-3456789", when set. */
  identityLine: string | null;
  memberCount: number;
  commsOn: boolean;
  gmail: "active" | "error" | "none";
  gmailAccount: string | null;
  fundraisingOn: boolean;
  captureOn: boolean;
  donorImportsDone: number;
  donorCount: number;
  giftCount: number;
  capturesDone: number;
  dismissed: boolean;
  /** NEXT_PUBLIC_SUPPORT_EMAIL, else the org's support_email (lib/admin/support.ts). */
  supportEmail: string | null;
};

export type SetupStepKey = "organization" | "teammate" | "gmail" | "donors" | "first_gift";

export type SetupStep = {
  key: SetupStepKey;
  n: number;
  title: string;
  why: string;
  minutes: number;
  done: boolean;
  /** Counted done because the module it needs is off. */
  notNeeded: boolean;
  /** What BloomOS found, once done. */
  detail: string | null;
  action: { label: string; href: string };
  alt: { label: string; href: string } | null;
};

/** Donor records that count as "already brought in" without an import. */
export const DONORS_ALREADY_IN = 25;

export function setupSteps(f: SetupFacts): SetupStep[] {
  const gmailNeeded = f.commsOn;
  const donorsNeeded = f.fundraisingOn;
  const giftNeeded = f.fundraisingOn || f.captureOn;
  const donorsDone = f.donorImportsDone > 0 || f.donorCount >= DONORS_ALREADY_IN;
  const giftDone = f.giftCount > 0 || f.capturesDone > 0;

  return [
    {
      key: "organization",
      n: 1,
      title: "Confirm your organization",
      why: "Name, address and EIN. Needed for donor receipts.",
      minutes: 2,
      done: f.identityComplete,
      notNeeded: false,
      detail: f.identityComplete ? f.identityLine : null,
      action: { label: f.identityComplete ? "Edit" : "Confirm details", href: "/admin/settings/organization" },
      alt: null,
    },
    {
      key: "teammate",
      n: 2,
      title: "Invite a teammate",
      why: "Give someone their own sign-in, so you can share donors and tasks.",
      minutes: 2,
      done: f.memberCount >= 2,
      notNeeded: false,
      detail: f.memberCount >= 2 ? `${f.memberCount} people can sign in.` : null,
      action: { label: f.memberCount >= 2 ? "People and roles" : "Invite someone", href: "/admin/settings/people" },
      alt: null,
    },
    {
      key: "gmail",
      n: 3,
      title: "Connect Gmail",
      why: "Thank-you notes and receipts go out from your own address.",
      minutes: 2,
      done: !gmailNeeded || f.gmail === "active",
      notNeeded: !gmailNeeded,
      detail: !gmailNeeded
        ? "Not needed: Comms is not turned on for you."
        : f.gmail === "active"
          ? `Sending from ${f.gmailAccount ?? "your Google account"}.`
          : f.gmail === "error"
            ? "Gmail stopped sending. Reconnect it."
            : null,
      action: { label: f.gmail === "error" ? "Reconnect Gmail" : "Connect Gmail", href: "/admin/comms/settings" },
      alt: null,
    },
    {
      key: "donors",
      n: 4,
      title: "Bring in your donors",
      why: "Upload a spreadsheet. We check for duplicates and show you a preview before anything is saved.",
      minutes: 8,
      done: !donorsNeeded || donorsDone,
      notNeeded: !donorsNeeded,
      detail: !donorsNeeded ? "Not needed: Fundraising is not turned on for you." : donorsDone ? `${f.donorCount} donor records in BloomOS.` : null,
      action: { label: "Upload a spreadsheet", href: "/admin/settings/imports/csv?target=gift" },
      alt: null,
    },
    {
      key: "first_gift",
      n: 5,
      title: "Record your first gift",
      why: "Type it in, or say what happened and confirm the card BloomOS fills in.",
      minutes: 3,
      done: !giftNeeded || giftDone,
      notNeeded: !giftNeeded,
      detail: !giftNeeded
        ? "Not needed: Fundraising and Talk to log are off."
        : giftDone
          ? f.giftCount > 0
            ? `${f.giftCount} ${f.giftCount === 1 ? "gift" : "gifts"} recorded.`
            : "Logged with Talk to log."
          : null,
      action: f.fundraisingOn
        ? { label: "Record a gift", href: "/admin/fundraising/donors-funders" }
        : { label: "Talk to log", href: "#capture" },
      alt: f.fundraisingOn && f.captureOn ? { label: "or try Talk to log", href: "#capture" } : null,
    },
  ];
}

export type ChecklistView = {
  steps: SetupStep[];
  doneCount: number;
  total: number;
  minutesLeft: number;
  allDone: boolean;
};

export function checklistView(f: SetupFacts): ChecklistView {
  const steps = setupSteps(f);
  const done = steps.filter((s) => s.done);
  return {
    steps,
    doneCount: done.length,
    total: steps.length,
    minutesLeft: steps.filter((s) => !s.done).reduce((m, s) => m + s.minutes, 0),
    allDone: done.length === steps.length,
  };
}

/** Owners and admins see it until every step is done or it is dismissed. */
export function showChecklist(f: SetupFacts, canManageOrg: boolean): boolean {
  return canManageOrg && !f.dismissed && !checklistView(f).allDone;
}
