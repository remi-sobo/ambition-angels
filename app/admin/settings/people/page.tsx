import type { Metadata } from "next";
import Link from "next/link";
import { hasEntitlement } from "@/lib/admin/entitlements";
import SettingsSectionPage from "../_components/SettingsSectionPage";
import { requirePagePermission } from "../../_components/PermissionGate";
import PageHeader from "../../_components/PageHeader";
import DataTable, { type DataTableColumn } from "../../_components/ui/DataTable";
import { listMembers, type Member } from "@/lib/admin/people-server";
import { MEMBER_ROLES, roleLabel, rowPermissions } from "@/lib/admin/people";
import { filterParams, parseTableState, type TableSpec } from "@/lib/admin/dataTable";
import { InviteForm, MemberActions } from "./_components/PeopleControls";

// V4 Stage A3: Settings → People and roles. Everyone in the ACTIVE org with
// their role; invite, change role, remove. Owner/admin only (members.manage),
// checked here and again by every write route. Rules: lib/admin/people.ts.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "People and roles" };

const BASE = "/admin/settings/people";
const SPEC: TableSpec = { sortable: [], defaultSort: null, pageSize: 500 };

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

export default async function Page({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const gate = await requirePagePermission("members.manage", "People and roles");
  // Without members.manage, the section page says who can make changes here
  // (the same line every owner/admin-only Settings section shows).
  if (!gate.ok) return <SettingsSectionPage sectionKey="people" />;
  const ctx = gate.ctx;

  const [{ members, error }, staffOn] = await Promise.all([listMembers(ctx.orgId), hasEntitlement("modules.staff")]);
  const owners = members.filter((m) => m.role === "owner").length;
  const actor = { userId: ctx.userId, role: ctx.role };
  const state = parseTableState(searchParams ?? {}, SPEC);

  const columns: DataTableColumn<Member>[] = [
    {
      key: "person",
      header: "Person",
      card: "title",
      render: (m) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-ink-1 truncate">
            {m.name ?? m.email}
            {m.userId === ctx.userId ? <span className="ml-2 text-xs font-normal text-ink-3">(you)</span> : null}
          </span>
          {m.name ? <span className="block text-xs text-ink-2 truncate">{m.email}</span> : null}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "text-ink-2",
      render: (m) => (
        <span className="block">
          {m.invited ? (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-status-watch-bg text-status-watch-text uppercase tracking-wider">
              Invited
            </span>
          ) : (
            <span className="block text-xs text-ink-2">Last signed in {fmtDate(m.lastSignIn)}</span>
          )}
          <span className="block text-xs text-ink-2 mt-0.5">
            {m.twoStep ? "Two-step login on" : "Two-step login not set up yet"}
          </span>
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (m) => {
        const p = rowPermissions(actor, m, owners);
        return (
          <MemberActions
            userId={m.userId}
            name={m.name ?? m.email}
            role={m.role}
            roleChoices={p.roleChoices.map((v) => ({ value: v, label: roleLabel(v) }))}
            canChangeRole={p.canChangeRole}
            canRemove={p.canRemove}
            canResetTwoStep={p.canResetTwoStep && m.twoStep}
            lockedReason={
              p.isSelf
                ? "Your own role is changed by another owner or admin."
                : m.role === "owner" && owners <= 1
                  ? "The only owner. Make someone else an owner first."
                  : m.role === "owner" && ctx.role !== "owner"
                    ? "Only an owner can change an owner."
                    : null
            }
          />
        );
      },
    },
  ];

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-reading space-y-6">
      <PageHeader title="People and roles" subtitle={`Who can sign in to ${ctx.orgName}, and what each person can do.`} />

      <InviteForm roles={MEMBER_ROLES.filter((r) => r.value !== "owner" || ctx.role === "owner").map((r) => ({ value: r.value, label: r.label }))} />

      <DataTable
        label={`People in ${ctx.orgName}`}
        noun={{ one: "person", many: "people" }}
        columns={columns}
        data={{ rows: members, total: members.length, page: state.page, pageSize: SPEC.pageSize, error }}
        getRowId={(m) => m.userId}
        getRowLabel={(m) => m.name ?? m.email}
        spec={SPEC}
        state={state}
        baseHref={BASE}
        filters={filterParams(searchParams ?? {})}
        emptyMessage="No one is in this organization yet. Invite the first person above."
      />

      {staffOn ? (
        <p className="text-sm text-ink-2">
          Your staff and how they are organized live on{" "}
          <Link href="/admin/organization/team" className="font-semibold text-orange hover:text-orange-dark">
            Team
          </Link>
          .
        </p>
      ) : null}

      <section aria-labelledby="roles-h" className="rounded-panel border border-hairline bg-surface px-5 py-4">
        <h2 id="roles-h" className="text-sm font-semibold text-ink-1">
          What each role can do
        </h2>
        <dl className="mt-2 space-y-1.5">
          {MEMBER_ROLES.map((r) => (
            <div key={r.value} className="text-sm">
              <dt className="inline font-semibold text-ink-1">{r.label}: </dt>
              <dd className="inline text-ink-2">{r.blurb}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
