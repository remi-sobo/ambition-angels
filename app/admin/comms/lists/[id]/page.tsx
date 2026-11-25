import { notFound } from "next/navigation";
import PageShell from "../../../_components/ui/PageShell";
import PageHeader from "../../../_components/PageHeader";
import { requirePagePermission } from "../../../_components/PermissionGate";
import { createServerSupabase } from "@/lib/supabase/server";
import ListBuilder from "../../_components/ListBuilder";
import type { ListDefinition } from "@/lib/comms/lists";

// Comms → Lists → one list (specs/comms-v3-composer.md).
export const dynamic = "force-dynamic";

export default async function ListPage({ params }: { params: { id: string } }) {
  const gate = await requirePagePermission("fundraising.read", "Comms", { entitlement: "modules.comms" });
  if (!gate.ok) return gate.page;
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const { data: list } = await createServerSupabase()
    .from("segments")
    .select("id, name, definition")
    .eq("org_id", gate.ctx.orgId)
    .eq("id", params.id)
    .maybeSingle();
  if (!list) notFound();

  return (
    <PageShell>
      <PageHeader
        title={list.name as string}
        subtitle="Change who is on it. Emails already sent are not affected."
        breadcrumb={[{ label: "Lists", href: "/admin/comms/lists" }, { label: list.name as string }]}
      />
      <ListBuilder id={list.id as string} initialName={list.name as string} initialDefinition={(list.definition ?? {}) as ListDefinition} />
    </PageShell>
  );
}
