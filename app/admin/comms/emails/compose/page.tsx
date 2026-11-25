import PageShell from "../../../_components/ui/PageShell";
import PageHeader from "../../../_components/PageHeader";
import { requirePagePermission } from "../../../_components/PermissionGate";
import { ctxHasPermission } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import Composer from "../../_components/Composer";

// Comms → Emails → Write an email (specs/comms-v3-composer.md). Nothing is
// created until there is a subject and a message; ?list=<id> starts with a
// list already chosen (from the Lists page).
export const dynamic = "force-dynamic";

export default async function ComposePage({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const gate = await requirePagePermission("fundraising.read", "Comms", { entitlement: "modules.comms" });
  if (!gate.ok) return gate.page;
  const { data } = await createServerSupabase()
    .from("segments")
    .select("id, name")
    .eq("org_id", gate.ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(100);
  const lists = (data ?? []) as Array<{ id: string; name: string }>;
  const wanted = typeof searchParams.list === "string" ? searchParams.list : "";
  const segmentId = lists.some((l) => l.id === wanted) ? wanted : null;

  return (
    <PageShell>
      <PageHeader
        title="Write an email"
        subtitle="One email per person, from your own inbox"
        breadcrumb={[{ label: "Emails", href: "/admin/comms/emails" }, { label: "Write an email" }]}
      />
      <Composer
        campaignId={null}
        initial={{ subject: "", body: "", segmentId }}
        lists={lists}
        canSend={await ctxHasPermission(gate.ctx, "comms.send")}
      />
    </PageShell>
  );
}
