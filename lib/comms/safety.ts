import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/notify";
import { personalize, buildCampaignEmail } from "@/lib/fundraising/comms-email";
import { loadOrgCommsSettings, sendBlocker, type OrgCommsSettings } from "./settings";
import { transportFor } from "./transport";

/**
 * Safety nets (specs/comms-v2-gmail-amendment.md G4), run at the end of each
 * worker tick on the service-role client. Every query is org-scoped.
 *
 *   - Stuck-send alarm: a campaign still sending after 24 hours, or an org
 *     whose sender is broken while emails wait, notifies the org's admins
 *     (in BloomOS and by email), at most once a day each.
 *   - Copy to leadership: once a campaign finishes, each address on the
 *     org's leadership list gets one copy, sent through the org's own sender.
 */

type Admin = ReturnType<typeof getSupabaseAdmin>;

export const STUCK_AFTER_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_LEADERSHIP_EMAILS = 10;

const isEmail = (v: string) => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(v);

/** Parse a comma, semicolon or newline separated list. Returns the clean
 *  list or the first problem, for the settings form. */
export function parseEmailList(input: string): { emails: string[] } | { error: string } {
  const parts = input.split(/[,;\n]/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const bad = parts.find((p) => !isEmail(p));
  if (bad) return { error: `"${bad}" isn't an email address.` };
  const emails = Array.from(new Set(parts));
  if (emails.length > MAX_LEADERSHIP_EMAILS) return { error: `Up to ${MAX_LEADERSHIP_EMAILS} addresses.` };
  return { emails };
}

/** Whether a campaign that started at `startedAt` counts as stuck now. */
export function isStuck(startedAt: string | null, now: number): boolean {
  return !!startedAt && now - Date.parse(startedAt) > STUCK_AFTER_MS;
}

/** The body of a leadership copy: a one-line note, then the campaign as a
 *  donor saw it (merge fields filled with the generic fallback). */
export function leadershipCopyBody(body: string, sent: number, finishedAt: string | null): string {
  const when = finishedAt
    ? new Date(finishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "today";
  const note = `This is a copy of a campaign that went to ${sent} ${sent === 1 ? "person" : "people"}, finished ${when}.`;
  return `${note}\n\n${personalize(body, "")}`;
}

/** Org members whose role can manage the org: the people an alarm is for. */
async function orgManagers(admin: Admin, orgId: string): Promise<string[]> {
  const { data: roles } = await admin.from("role_permissions").select("role").eq("permission", "org.manage");
  const roleNames = ((roles ?? []) as Array<{ role: string }>).map((r) => r.role);
  if (roleNames.length === 0) return [];
  const { data } = await admin.from("memberships").select("user_id").eq("org_id", orgId).in("role", roleNames);
  return ((data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
}

async function alertManagers(admin: Admin, orgId: string, title: string, body: string, url: string): Promise<void> {
  for (const recipientId of await orgManagers(admin, orgId)) {
    await notify({ orgId, recipientId, type: "comms.stuck", title, body, url });
  }
}

export async function raiseAlarms(
  blocked: Array<{ orgId: string; reason: string }>,
  now: number = Date.now()
): Promise<number> {
  const admin = getSupabaseAdmin();
  let raised = 0;

  // 1. Campaigns still sending a day after they started.
  const cutoff = new Date(now - STUCK_AFTER_MS).toISOString();
  const { data: stuck } = await admin
    .from("email_campaigns")
    .select("id, org_id, name, started_at, sent_count, recipient_count")
    .eq("status", "sending")
    .lt("started_at", cutoff)
    .is("stuck_alerted_at", null)
    .limit(50);
  for (const c of (stuck ?? []) as Array<{ id: string; org_id: string; name: string; started_at: string; sent_count: number; recipient_count: number }>) {
    if (!isStuck(c.started_at, now)) continue;
    await alertManagers(
      admin,
      c.org_id,
      `"${c.name}" is still sending after a day`,
      `${c.sent_count} of ${c.recipient_count} have gone out. A big list can take a few days at your daily cap; if the count isn't moving, check the Gmail connection on the Comms page.`,
      `/admin/comms/emails/${c.id}`
    );
    await admin.from("email_campaigns").update({ stuck_alerted_at: new Date(now).toISOString() }).eq("org_id", c.org_id).eq("id", c.id);
    raised += 1;
  }

  // 2. Orgs whose sender is broken while emails wait (from this tick).
  for (const b of blocked) {
    const { data: s } = await admin.from("org_comms_settings").select("blocked_alerted_at").eq("org_id", b.orgId).maybeSingle();
    const last = s?.blocked_alerted_at ? Date.parse(s.blocked_alerted_at as string) : 0;
    if (now - last < DAY_MS) continue;
    await alertManagers(admin, b.orgId, "Campaign emails are waiting and can't send", b.reason, "/admin/comms/emails");
    await admin.from("org_comms_settings").update({ blocked_alerted_at: new Date(now).toISOString() }).eq("org_id", b.orgId);
    raised += 1;
  }
  return raised;
}

export async function sendLeadershipCopies(): Promise<number> {
  const admin = getSupabaseAdmin();
  const { data: done } = await admin
    .from("email_campaigns")
    .select("id, org_id, subject, body, sent_count, finished_at")
    .eq("status", "sent")
    .is("leadership_copied_at", null)
    .limit(20);
  let copies = 0;
  const settingsCache = new Map<string, OrgCommsSettings | null>();

  for (const c of (done ?? []) as Array<{ id: string; org_id: string; subject: string; body: string; sent_count: number; finished_at: string | null }>) {
    if (!settingsCache.has(c.org_id)) settingsCache.set(c.org_id, await loadOrgCommsSettings(admin, c.org_id));
    const settings = settingsCache.get(c.org_id) ?? null;
    const markDone = () =>
      admin.from("email_campaigns").update({ leadership_copied_at: new Date().toISOString() }).eq("org_id", c.org_id).eq("id", c.id);

    const list = settings?.leadership_copy_emails ?? [];
    if (!settings || list.length === 0 || sendBlocker(settings)) {
      await markDone();
      continue;
    }
    const resolved = await transportFor(settings);
    // Sender broken: leave it for a later tick rather than drop the copies.
    if ("blocked" in resolved) continue;

    for (const to of list) {
      try {
        await resolved.transport.send(
          buildCampaignEmail({
            settings,
            to,
            subject: `[Copy] ${c.subject}`,
            bodyText: leadershipCopyBody(c.body, c.sent_count, c.finished_at),
            constituentId: null,
          })
        );
        copies += 1;
      } catch (err) {
        console.error(`[comms-queue] leadership copy to ${to} failed:`, err instanceof Error ? err.message : err);
      }
    }
    await markDone();
  }
  return copies;
}
