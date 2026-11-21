import type { Metadata } from "next";
import Link from "next/link";
import SettingsSectionPage from "../_components/SettingsSectionPage";
import { requirePagePermission } from "../../_components/PermissionGate";
import PageHeader from "../../_components/PageHeader";
import { getEntitlements, hasFeature } from "@/lib/admin/entitlements";
import { getGmailConnectionStatus } from "@/lib/comms/gmail-connection";
import { getCalendarConnectionStatus } from "@/lib/google/connection";
import { hubspotReadOrg, hubspotWriteOrg } from "@/lib/hubspot/connection";
import { connectionRows, type ConnectionFacts, type ConnectionTone } from "@/lib/admin/connectionsView";
import { getResidentOrgId } from "@/lib/admin/orgs";
import { getSchedulerConnectionStatus } from "@/lib/google/scheduler-connection";
import { SchedulerGoogleCard, type SchedulerNotice } from "./SchedulerGoogleCard";

// V4 Stage F: Settings → Connections. Gmail, Google Calendar and HubSpot
// status in one place, each with its one next step (the connect flows stay
// where they live). Owner/admin only (org.manage). Read-only: the status
// readers use the service role on `connections` (RLS deny-all) and never
// return a token.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connections" };

const TONE: Record<ConnectionTone, string> = {
  ok: "bg-revenue-bg text-revenue",
  attention: "bg-status-watch-bg text-status-watch-text",
  off: "bg-tile text-ink-2",
};
const TONE_LABEL: Record<ConnectionTone, string> = { ok: "Connected", attention: "Needs you", off: "Off" };

function schedulerNotice(sp: Record<string, string | string[] | undefined>): SchedulerNotice {
  const v = typeof sp.scheduler === "string" ? sp.scheduler : null;
  if (v === "connected" || v === "cancelled") return { kind: v };
  if (v === "error") return { kind: "error", reason: typeof sp.reason === "string" ? sp.reason : undefined };
  return null;
}

export default async function Page({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const gate = await requirePagePermission("org.manage", "Connections");
  if (!gate.ok) return <SettingsSectionPage sectionKey="connections" />;
  const ctx = gate.ctx;
  const ents = await getEntitlements(ctx.orgId);

  const [gmail, calendar, hubOut, hubIn] = await Promise.all([
    hasFeature(ents, "modules.comms") ? getGmailConnectionStatus(ctx.orgId) : Promise.resolve(null),
    getCalendarConnectionStatus(ctx.userId).catch(() => null),
    hasFeature(ents, "aa.hubspot_mirror") ? hubspotWriteOrg() : Promise.resolve(null),
    hasFeature(ents, "aa.hubspot_mirror") ? hubspotReadOrg() : Promise.resolve(null),
  ]);
  const facts: ConnectionFacts = {
    gmail: gmail && gmail.state !== "none" ? { state: gmail.state, accountEmail: gmail.accountEmail, reason: gmail.reason } : gmail,
    calendar: calendar
      ? { connected: calendar.connected, accounts: calendar.calendars.map((c) => c.accountEmail ?? c.label), lastSyncedAt: calendar.lastSyncedAt }
      : null,
    hubspot: hasFeature(ents, "aa.hubspot_mirror") ? { syncOut: hubOut === ctx.orgId, syncIn: hubIn === ctx.orgId } : null,
  };
  const rows = connectionRows(facts);
  // The /meet scheduler only books for the resident org (lib/meet/host.ts).
  const residentOrgId = await getResidentOrgId().catch(() => null);
  const scheduler = ctx.orgId === residentOrgId ? await getSchedulerConnectionStatus(ctx.orgId) : null;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-reading space-y-6">
      <PageHeader title="Connections" subtitle="The outside systems BloomOS works with, and whether each one is working." />
      <ul className="rounded-panel border border-hairline bg-surface divide-y divide-outline" aria-label="Connections">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-ink-1">{r.name}</h2>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TONE[r.tone]}`}>{TONE_LABEL[r.tone]}</span>
              </div>
              <p className="text-sm text-ink-1 mt-1">{r.status}</p>
              <p className="text-sm text-ink-2 mt-0.5">{r.what}</p>
            </div>
            {r.action ? (
              <Link
                href={r.action.href}
                className="inline-flex min-h-[44px] items-center justify-center rounded-control border border-outline bg-surface px-4 text-sm font-semibold text-ink-1 hover:bg-tile shrink-0"
              >
                {r.action.label}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      {scheduler ? <SchedulerGoogleCard status={scheduler} notice={schedulerNotice(searchParams)} /> : null}
    </div>
  );
}
