import PageShell, { PageSection } from "../../_components/ui/PageShell";
import PageHeader from "../../_components/PageHeader";
import Card, { CardHeader } from "../../_components/ui/Card";
import { requirePagePermission } from "../../_components/PermissionGate";
import { ctxHasPermission } from "@/lib/admin/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getGmailConnectionStatus } from "@/lib/comms/gmail-connection";
import { loadFormats } from "@/lib/admin/comms/editions-server";
import { GmailCard, type GmailNotice } from "../../fundraising/comms/_components/GmailCard";
import { SettingsCard, type CommsSettings } from "../../fundraising/comms/_components/SettingsCard";
import FormatEditor, { type FormatRowView } from "../_components/FormatEditor";

/**
 * Comms → Settings (V4 Stage D; Settings archetype, reading width): the
 * sending identity (the existing G1 Gmail card and identity card, which also
 * still sit on Emails) and the newsletter formats.
 */
export const dynamic = "force-dynamic";

function gmailNotice(params: Record<string, string | undefined>): GmailNotice {
  const kind = params.gmail;
  const reason = typeof params.reason === "string" ? params.reason.slice(0, 300) : undefined;
  if (kind === "connected" || kind === "cancelled") return { kind };
  if (kind === "error") return { kind, reason };
  return null;
}

export default async function CommsSettingsPage({ searchParams = {} }: { searchParams?: Record<string, string | undefined> }) {
  const gate = await requirePagePermission("comms.manage", "Comms", { entitlement: "modules.comms" });
  if (!gate.ok) return gate.page;
  const ctx = gate.ctx;
  const db = getSupabaseAdmin();
  const [settingsRes, gmail, canManage, formats] = await Promise.all([
    db
      .from("org_comms_settings")
      .select("from_name, from_email, reply_to, mailing_address, footer_text, daily_send_cap, transport, leadership_copy_emails")
      .eq("org_id", ctx.orgId)
      .maybeSingle(),
    getGmailConnectionStatus(ctx.orgId),
    ctxHasPermission(ctx, "org.manage"),
    loadFormats(db, ctx.orgId, { seed: true }),
  ]);
  const settings = (settingsRes.data ?? null) as CommsSettings | null;

  return (
    <PageShell width="reading">
      <PageHeader title="Comms settings" subtitle="Who your email comes from, and the shapes your newsletters take" />
      <PageSection title="Sender">
        <div className="space-y-4">
          <GmailCard status={gmail} transport={settings?.transport ?? null} canManage={canManage} notice={gmailNotice(searchParams)} />
          <SettingsCard settings={settings} gmailAccount={settings?.transport === "gmail" && gmail.state !== "none" ? gmail.accountEmail : null} />
        </div>
      </PageSection>
      <PageSection title="Formats">
        <Card>
          <CardHeader title="Newsletter formats" hint="Each edition copies its format's slots when it starts." />
          <FormatEditor formats={formats as unknown as FormatRowView[]} />
        </Card>
      </PageSection>
    </PageShell>
  );
}
