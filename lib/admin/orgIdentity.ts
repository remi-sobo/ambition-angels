/**
 * V4 Stage F: an organization's identity, read from and written to
 * orgs.settings jsonb (no schema change). PURE: the Settings → Organization
 * route, the operator setup script and the Home checklist all use it, and
 * tests drive it directly.
 *
 * Keys inside orgs.settings:
 *   legal_name, ein          (already read by lib/email/org-identity.ts, #585,
 *                             for the receipt's tax statement)
 *   address {street, city, state, postal_code}
 *   mailing_address          (the one-line form of address, derived on write;
 *                             the thank-you identity falls back to it when the
 *                             Comms mailing address is blank)
 *   timezone                 (IANA name)
 *   support_email            (operator-set; the support fallback when
 *                             NEXT_PUBLIC_SUPPORT_EMAIL is unset)
 *   setup_checklist          {dismissed_at, dismissed_by}
 *
 * The fiscal year is NOT stored here: fin_config.fiscal_year_start_month is
 * the one source Finance reads, so the Organization screen writes there.
 */

export type OrgAddress = { street: string; city: string; state: string; postal_code: string };

export type OrgIdentity = {
  name: string;
  legalName: string;
  ein: string;
  address: OrgAddress;
  timezone: string;
};

export type Settings = Record<string, unknown>;

const s = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const EIN_RE = /^\d{2}-?\d{7}$/;

/** "123456789" or "12-3456789" → "12-3456789"; anything else unchanged. */
export function normalizeEin(raw: string): string {
  const t = raw.trim();
  return /^\d{9}$/.test(t) ? `${t.slice(0, 2)}-${t.slice(2)}` : t;
}

export function isValidTimezone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The time zones offered in the Organization form (the US first, then a few common ones). */
export const TIMEZONE_CHOICES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "America/Puerto_Rico", label: "Atlantic (Puerto Rico)" },
  { value: "America/Toronto", label: "Eastern (Toronto)" },
  { value: "Europe/London", label: "London" },
];

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatAddress(a: OrgAddress): string {
  const cityLine = [a.city, [a.state, a.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [a.street, cityLine].filter(Boolean).join(", ");
}

function readAddress(v: unknown): OrgAddress {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { street: s(o.street), city: s(o.city, 120), state: s(o.state, 40), postal_code: s(o.postal_code, 20) };
}

export function readOrgIdentity(org: { name: string; settings: Settings | null }): OrgIdentity {
  const st = org.settings ?? {};
  return {
    name: org.name,
    legalName: s(st.legal_name),
    ein: s(st.ein, 20),
    address: readAddress(st.address),
    timezone: s(st.timezone, 60),
  };
}

/** Checklist step 1: legal name, a full address and a valid EIN. */
export function identityComplete(id: OrgIdentity): boolean {
  const a = id.address;
  return !!id.legalName && EIN_RE.test(id.ein) && !!a.street && !!a.city && !!a.state && !!a.postal_code;
}

export type IdentityInput = {
  name: string;
  legal_name: string;
  ein: string;
  address: OrgAddress;
  timezone: string;
};

export type IdentityCheck = { ok: true; value: IdentityInput } | { ok: false; field: string; error: string };

/**
 * Validate a body from the Organization form (or an answers file). Blank
 * legal name, EIN and address parts are allowed (an org can save what it
 * has); what is given must be well formed.
 */
export function validateIdentityInput(body: Record<string, unknown> | null): IdentityCheck {
  if (!body) return { ok: false, field: "body", error: "Nothing to save." };
  const name = s(body.name, 120);
  if (!name) return { ok: false, field: "name", error: "Enter your organization's name." };
  const legal_name = s(body.legal_name);
  const ein = normalizeEin(s(body.ein, 20));
  if (ein && !EIN_RE.test(ein)) return { ok: false, field: "ein", error: "An EIN is nine digits, like 12-3456789." };
  const address = readAddress(body.address);
  if (address.state && !/^[A-Za-z .]{2,40}$/.test(address.state)) {
    return { ok: false, field: "state", error: "Enter a state, like ME." };
  }
  const timezone = s(body.timezone, 60);
  if (timezone && !isValidTimezone(timezone)) return { ok: false, field: "timezone", error: "Choose a time zone from the list." };
  return { ok: true, value: { name, legal_name, ein, address, timezone } };
}

/** Merge validated identity into existing settings, keeping every other key. */
export function mergeIdentityIntoSettings(settings: Settings | null, v: IdentityInput): Settings {
  const out: Settings = { ...(settings ?? {}) };
  const put = (k: string, val: string) => {
    if (val) out[k] = val;
    else delete out[k];
  };
  put("legal_name", v.legal_name);
  put("ein", v.ein);
  put("timezone", v.timezone);
  const hasAddress = Object.values(v.address).some(Boolean);
  if (hasAddress) {
    out.address = { ...v.address };
    out.mailing_address = formatAddress(v.address);
  } else {
    delete out.address;
    delete out.mailing_address;
  }
  return out;
}

/** True when the checklist was dismissed with "Finish later". */
export function checklistDismissed(settings: Settings | null): boolean {
  const c = (settings ?? {}).setup_checklist as Record<string, unknown> | undefined;
  return !!(c && typeof c.dismissed_at === "string" && c.dismissed_at);
}
