import { notFound, redirect } from "next/navigation";
import PageShell from "../../../../_components/ui/PageShell";
import PageHeader from "../../../../_components/PageHeader";
import { requirePagePermission } from "../../../../_components/PermissionGate";
import { ctxHasPermission } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import Composer from "../../../_components/Composer";

// Comms → Emails → edit a draft (specs/comms-v3-composer.md). Only a draft
// can be edited; anything queued or sent goes to its results page.
export const dynamic = "force-dynamic";

export default async function EditEmailPage({ params }: { params: { id: string } }) {
  const gate = await requirePagePermission("fundraising.read", "Comms", { entitlement: "modules.comms" });
  if (!gate.ok) return gate.page;
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const supabase = createServerSupabase();
  const orgId = gate.ctx.orgId;
  const [{ data: campaign }, { data: segs }] = await Promise.all([
    supabase.from("email_campaigns").select("id, subject, body, status, segment_id").eq("org_id", orgId).eq("id", params.id).maybeSingle(),
    supabase.from("segments").select("id, name").eq("org_id", orgId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (!campaign) notFound();
  if (campaign.status !== "draft") redirect(`/admin/comms/emails/${params.id}`);

  return (
    <PageShell>
      <PageHeader
        title="Write an email"
        subtitle="One email per person, from your own inbox"
        breadcrumb={[{ label: "Emails", href: "/admin/comms/emails" }, { label: (campaign.subject as string) || "Draft" }]}
      />
      <Composer
        campaignId={campaign.id as string}
        initial={{ subject: (campaign.subject as string) ?? "", body: (campaign.body as string) ?? "", segmentId: (campaign.segment_id as string | null) ?? null }}
        lists={(segs ?? []) as Array<{ id: string; name: string }>}
        canSend={await ctxHasPermission(gate.ctx, "comms.send")}
      />
    </PageShell>
  );
}
