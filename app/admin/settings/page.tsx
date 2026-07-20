import { getOrgContext } from "@/lib/admin/auth";
import { getMyDisplayName } from "@/lib/admin/profile";
import { getCalendarConnectionStatus, type CalendarConnectionStatus } from "@/lib/google/connection";
import { createServerSupabase } from "@/lib/supabase/server";
import { spendSummary } from "@/lib/ai/ledger";
import { orgMonthlyCapUsd } from "@/lib/ai/cap";
import PageHeader from "../_components/PageHeader";
import { DisplayNameForm, ConnectCalendarControls, ChangePasswordForm, SignOutAllButton } from "./_components/AccountControls";
import HubspotSyncPanel from "./_components/HubspotSyncPanel";
import { TYPE } from "@/lib/admin/typeScale";

// BloomOS account settings. Centerpiece is a password change that requires the
// current password; plus account info and session controls an admin expects.
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
  finance: "Finance",
  board_viewer: "Board viewer",
};

// Friendly names for the ai_calls.surface values written across the app.
const SURFACE_LABEL: Record<string, string> = {
  reed: "Reed",
  funder_research: "Funder research",
  next_best_action: "Next best action",
  prospect_discovery: "Prospect discovery",
  acknowledgment: "Thank-you drafts",
  briefing: "Executive briefing",
  career: "Career match",
};

const usd = (n: number) => `$${n.toFixed(2)}`;

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border-[1.5px] border-outline rounded-card-lg p-5 lg:p-6">
      <h2 className="font-heading font-semibold text-ink-1">{title}</h2>
      {description && <p className="text-xs text-ink-2 mt-1 mb-4">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </section>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: { calendar?: string; reason?: string };
}) {
  const ctx = await getOrgContext();
  if (!ctx) return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  const displayName = (await getMyDisplayName()) ?? "";

  // Calendar status reads via service-role; degrade gracefully if unconfigured.
  let calendarStatus: CalendarConnectionStatus | null = null;
  try {
    calendarStatus = await getCalendarConnectionStatus(ctx.userId);
  } catch {
    calendarStatus = null;
  }

  // Month-to-date AI spend for this org, from the unified ledger. RLS-scoped
  // via the session client; returns an empty summary if the read fails.
  const spend = await spendSummary(createServerSupabase(), ctx.orgId);
  const aiCapUsd = orgMonthlyCapUsd();

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[760px]">
      <PageHeader title="Settings" subtitle="Your BloomOS account and security" />

      <div className="space-y-5">
        <Card title="Account">
          <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-2">Email</dt>
            <dd className="text-ink-1 break-all">{ctx.email || "—"}</dd>
            <dt className="text-ink-2">Role</dt>
            <dd className="text-ink-1">{ROLE_LABEL[ctx.role] ?? ctx.role}</dd>
          </dl>
        </Card>

        <Card title="Your name" description="How BloomOS addresses you — shown in the greeting and on agenda owner chips.">
          <DisplayNameForm initialName={displayName} />
        </Card>

        <Card
          title="AI usage this month"
          description="What the org has spent on AI features so far this month, across every assistant and agent."
        >
          <div className="flex items-baseline gap-2 mb-3">
            <span className={TYPE.cardMetric}>
              {usd(spend.totalUsd)}
            </span>
            <span className="text-xs text-ink-2">of {usd(aiCapUsd)} this month</span>
            {spend.totalUsd >= aiCapUsd * 0.8 && (
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full border text-expense bg-expense-bg border-expense/30">
                {spend.totalUsd >= aiCapUsd ? "cap reached" : "near cap"}
              </span>
            )}
          </div>
          {spend.bySurface.length === 0 ? (
            <p className="text-xs text-ink-2">No AI usage recorded yet this month.</p>
          ) : (
            <ul className="divide-y divide-outline">
              {spend.bySurface.map((s) => (
                <li key={s.surface} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-ink-1">{SURFACE_LABEL[s.surface] ?? s.surface}</span>
                  <span className="text-ink-2 tabular-nums">
                    {usd(s.costUsd)}
                    <span className="text-ink-3"> · {s.calls} {s.calls === 1 ? "call" : "calls"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Google Calendar"
          description="Connect your calendar so BloomOS can show your day. Read-only — BloomOS never changes your events."
        >
          {calendarStatus ? (
            <ConnectCalendarControls
              status={calendarStatus}
              oauthResult={searchParams?.calendar}
              oauthReason={searchParams?.reason}
            />
          ) : (
            <p className="text-xs text-ink-2">
              Calendar status is unavailable right now (the server isn&apos;t fully configured). Try again shortly.
            </p>
          )}
        </Card>

        <Card
          title="HubSpot sync"
          description="Refresh the fundraising spine from HubSpot, and see how current the data is. Runs on demand."
        >
          <HubspotSyncPanel />
        </Card>

        <Card
          title="Change password"
          description="Enter your current password to confirm, then set a new one (8+ characters). No password yet, or forgot it? Use the reset link below."
        >
          <ChangePasswordForm />
        </Card>

        <Card
          title="Sessions"
          description="Signed in on a shared or lost device? Sign out everywhere and back in with your password."
        >
          <SignOutAllButton />
        </Card>
      </div>
    </div>
  );
}
