import PageShell from "../../_components/ui/PageShell";
import PageHeader from "../../_components/PageHeader";
import Card from "../../_components/ui/Card";
import ListRow, { ListRows } from "../../_components/ui/ListRow";
import { ButtonLink } from "../../_components/ui/Button";
import EmptyState from "../../_components/EmptyState";
import { requirePagePermission } from "../../_components/PermissionGate";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveRecipients } from "@/lib/fundraising/segments";
import { describeList } from "@/lib/comms/lists";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Comms → Lists (specs/comms-v3-composer.md). Every saved list with who is
 * on it today, counted by the send path's own resolver. A list is a saved
 * `segments` row, so the saved views from Donors & Funders show here too.
 */
export const dynamic = "force-dynamic";

type ListRowData = { id: string; name: string; definition: unknown };

// Counting reads the whole donor list once per saved list, so only the
// newest lists are counted up front.
const COUNTED = 24;

export default async function ListsPage() {
  const gate = await requirePagePermission("fundraising.read", "Comms", { entitlement: "modules.comms" });
  if (!gate.ok) return gate.page;
  const orgId = gate.ctx.orgId;
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("segments")
    .select("id, name, definition")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100);
  const lists = (data ?? []) as ListRowData[];

  const counts = new Map<string, { n: number; error: string | null }>();
  await Promise.all(
    lists.slice(0, COUNTED).map(async (l) => {
      const r = await resolveRecipients(supabase, l.definition, orgId);
      counts.set(l.id, { n: r.recipients.length, error: r.error ?? null });
    })
  );

  return (
    <PageShell>
      <PageHeader
        title="Lists"
        subtitle="Who your emails go to"
        primaryAction={<ButtonLink href="/admin/comms/lists/new" variant="primary">New list</ButtonLink>}
      />

      <Card padded={false}>
        {lists.length === 0 ? (
          <div className="p-4">
            <EmptyState
              label="lists"
              title="No lists yet"
              hint="A list is who an email goes to: all your donors, people who gave last year, or a few people you pick by hand. Build one and you will see everyone on it before you write a word."
              primaryAction={<ButtonLink href="/admin/comms/lists/new" variant="primary">Build your first list</ButtonLink>}
            />
          </div>
        ) : (
          <ListRows className="px-4">
            {lists.map((l) => {
              const c = counts.get(l.id);
              return (
                <ListRow
                  key={l.id}
                  href={`/admin/comms/lists/${l.id}`}
                  title={l.name}
                  context={c?.error ? c.error : describeList(l.definition)}
                  actions={
                    <div className="flex items-center gap-3">
                      {c && !c.error ? (
                        <span className={`${TYPE.body} [font-variant-numeric:tabular-nums] whitespace-nowrap`}>
                          {c.n.toLocaleString("en-US")} {c.n === 1 ? "person" : "people"}
                        </span>
                      ) : null}
                      <ButtonLink href={`/admin/comms/emails/compose?list=${l.id}`} size="sm">
                        Write an email
                      </ButtonLink>
                    </div>
                  }
                />
              );
            })}
          </ListRows>
        )}
      </Card>
    </PageShell>
  );
}
