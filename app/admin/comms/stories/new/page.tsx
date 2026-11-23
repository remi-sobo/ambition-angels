import PageShell from "../../../_components/ui/PageShell";
import PageHeader from "../../../_components/PageHeader";
import Card from "../../../_components/ui/Card";
import { requirePagePermission } from "../../../_components/PermissionGate";
import StoryCaptureForm from "../../_components/StoryCaptureForm";

/**
 * Capture a story on a phone (V4 Stage D, StoryPhone.dc.html): one screen,
 * about fifteen seconds. The same form the desktop drawer uses.
 */
export const dynamic = "force-dynamic";

export default async function NewStoryPage() {
  const gate = await requirePagePermission("comms.manage", "Comms", { entitlement: "modules.comms" });
  if (!gate.ok) return gate.page;
  return (
    <PageShell width="reading">
      <PageHeader title="Capture a story" breadcrumb={[{ label: "Stories", href: "/admin/comms/stories" }]} />
      <Card>
        <StoryCaptureForm />
      </Card>
    </PageShell>
  );
}
