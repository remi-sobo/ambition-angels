import PageShell from "../../_components/ui/PageShell";
import PageHeader from "../../_components/PageHeader";
import { ButtonLink } from "../../_components/ui/Button";
import { requirePagePermission } from "../../_components/PermissionGate";
import { ctxHasPermission } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadTagOverview } from "@/lib/admin/tags-server";
import TagManager from "../_components/TagManager";

// Comms → Lists → Tags: the tag library for people.
export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const gate = await requirePagePermission("fundraising.read", "Comms", { entitlement: "modules.comms" });
  if (!gate.ok) return gate.page;
  const [overview, canWrite] = await Promise.all([
    loadTagOverview(createServerSupabase(), gate.ctx.orgId),
    ctxHasPermission(gate.ctx, "fundraising.write"),
  ]);
  return (
    <PageShell>
      <PageHeader
        title="Tags"
        subtitle="Labels on your people, so you can build lists from them"
        breadcrumb={[{ label: "Lists", href: "/admin/comms/lists" }, { label: "Tags" }]}
        secondaryActions={<ButtonLink href="/admin/comms/lists/new">New list</ButtonLink>}
      />
      <TagManager overview={overview} canWrite={canWrite} />
    </PageShell>
  );
}
