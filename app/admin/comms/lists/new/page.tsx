import PageShell from "../../../_components/ui/PageShell";
import PageHeader from "../../../_components/PageHeader";
import { requirePagePermission } from "../../../_components/PermissionGate";
import ListBuilder from "../../_components/ListBuilder";
import { STARTS, withStart, type ListDefinition, type StartValue } from "@/lib/comms/lists";
import { normalizeTag } from "@/lib/comms/tags";

// Comms → Lists → New (specs/comms-v3-composer.md).
export const dynamic = "force-dynamic";

export default async function NewListPage({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const gate = await requirePagePermission("fundraising.read", "Comms", { entitlement: "modules.comms" });
  if (!gate.ok) return gate.page;
  // Opened from an email (?email=<draft id> or ?email=new): saving returns there.
  const from = typeof searchParams.email === "string" ? searchParams.email : "";
  const forEmail = from === "new" || /^[0-9a-f-]{36}$/i.test(from) ? from : null;
  // From the Tags page: ?tag=<name> starts with everyone carrying it, and
  // ?start=<donors|lapsed|recurring|never> starts from an automatic group.
  const tag = normalizeTag(typeof searchParams.tag === "string" ? searchParams.tag : null);
  const start = typeof searchParams.start === "string" && STARTS.some((s) => s.value === searchParams.start) ? (searchParams.start as StartValue) : null;
  const initial: ListDefinition = tag ? { tags: [tag] } : start ? withStart({}, start) : { view: "donors" };
  const initialName = tag ?? "";
  return (
    <PageShell>
      <PageHeader
        title="New list"
        subtitle={forEmail ? "Pick who this email goes to. Saving takes you back to your email." : "Pick who is on it. You will see every person before you save."}
        breadcrumb={[{ label: "Lists", href: "/admin/comms/lists" }, { label: "New list" }]}
      />
      <ListBuilder initialName={initialName} initialDefinition={initial} forEmail={forEmail} />
    </PageShell>
  );
}
