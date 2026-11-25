import PageShell from "../../../_components/ui/PageShell";
import PageHeader from "../../../_components/PageHeader";
import { requirePagePermission } from "../../../_components/PermissionGate";
import ListBuilder from "../../_components/ListBuilder";

// Comms → Lists → New (specs/comms-v3-composer.md).
export const dynamic = "force-dynamic";

export default async function NewListPage() {
  const gate = await requirePagePermission("fundraising.read", "Comms", { entitlement: "modules.comms" });
  if (!gate.ok) return gate.page;
  return (
    <PageShell>
      <PageHeader
        title="New list"
        subtitle="Pick who is on it. You will see every person before you save."
        breadcrumb={[{ label: "Lists", href: "/admin/comms/lists" }, { label: "New list" }]}
      />
      <ListBuilder initialName="" initialDefinition={{ view: "donors" }} />
    </PageShell>
  );
}
