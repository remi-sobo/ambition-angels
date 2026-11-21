/**
 * V4 Stage F: Settings → Connections, one row per outside system with a
 * plain status and the one next step (spec §4 "Connections (Gmail,
 * Calendar, HubSpot)"). PURE: the page loads the three statuses, tests feed
 * fixtures.
 */

export type ConnectionTone = "ok" | "attention" | "off";

export type ConnectionRow = {
  key: "gmail" | "calendar" | "hubspot";
  name: string;
  what: string;
  status: string;
  tone: ConnectionTone;
  action: { label: string; href: string } | null;
};

export type ConnectionFacts = {
  /** null: Comms is not on for this org. */
  gmail: null | { state: "none" } | { state: "active" | "error"; accountEmail: string; reason: string | null };
  /** null: calendar status could not be read. */
  calendar: null | { connected: boolean; accounts: string[]; lastSyncedAt: string | null };
  /** null: HubSpot is not offered to this org. */
  hubspot: null | { syncOut: boolean; syncIn: boolean };
};

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

export function connectionRows(f: ConnectionFacts): ConnectionRow[] {
  const gmail: ConnectionRow = (() => {
    const base = { key: "gmail" as const, name: "Gmail", what: "Thank-yous, receipts and emails go out from your own Google account." };
    if (!f.gmail) return { ...base, status: "Comms is not turned on for your organization.", tone: "off", action: null };
    if (f.gmail.state === "none") {
      return { ...base, status: "Not connected. Donor emails can't go out yet.", tone: "attention", action: { label: "Connect Gmail", href: "/admin/comms/settings" } };
    }
    if (f.gmail.state === "error") {
      return {
        ...base,
        status: `Stopped sending from ${f.gmail.accountEmail}${f.gmail.reason ? `: ${f.gmail.reason}` : ""}.`,
        tone: "attention",
        action: { label: "Reconnect Gmail", href: "/admin/comms/settings" },
      };
    }
    return { ...base, status: `Connected. Sending from ${f.gmail.accountEmail}.`, tone: "ok", action: { label: "Manage", href: "/admin/comms/settings" } };
  })();

  const calendar: ConnectionRow = (() => {
    const base = { key: "calendar" as const, name: "Google Calendar", what: "Your own calendar, read-only, so Today and My Week show your day. Each person connects their own." };
    if (!f.calendar) return { ...base, status: "Calendar status is unavailable right now.", tone: "off", action: { label: "Open", href: "/admin/settings#google-calendar" } };
    if (!f.calendar.connected) {
      return { ...base, status: "You have not connected your calendar.", tone: "attention", action: { label: "Connect your calendar", href: "/admin/settings#google-calendar" } };
    }
    const synced = day(f.calendar.lastSyncedAt);
    return {
      ...base,
      status: `Connected${f.calendar.accounts.length ? ` (${f.calendar.accounts.join(", ")})` : ""}${synced ? `. Last synced ${synced}` : ""}.`,
      tone: "ok",
      action: { label: "Manage", href: "/admin/settings#google-calendar" },
    };
  })();

  const hubspot: ConnectionRow = (() => {
    const base = { key: "hubspot" as const, name: "HubSpot", what: "Keep donors and asks in step with a HubSpot account." };
    if (!f.hubspot) {
      return { ...base, status: "Not available for your organization yet. Spreadsheet import covers donors and gifts today.", tone: "off", action: { label: "Import a spreadsheet", href: "/admin/settings/imports/csv" } };
    }
    const dir = f.hubspot.syncOut && f.hubspot.syncIn ? "both ways" : f.hubspot.syncOut ? "from BloomOS to HubSpot" : f.hubspot.syncIn ? "from HubSpot to BloomOS" : null;
    return {
      ...base,
      status: dir ? `Connected. Syncing ${dir}.` : "Connected for reading. Sync is off.",
      tone: "ok",
      action: { label: "Sync settings", href: "/admin/settings/fundraising/general" },
    };
  })();

  return [gmail, calendar, hubspot];
}
