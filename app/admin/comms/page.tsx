import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";
import PageHeader from "@/app/admin/_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Comms — the story bank's route scaffold (specs/comms-module.md Phase 1).
 *
 * Deliberately empty of product. Phase 1 ships the schema, the permissions,
 * and the API; the bank list, the capture modal, the drag rank, and the
 * consent panel are Phase 2. This page exists so the route, the module gate,
 * and the permission gate are real and testable before any of that lands.
 *
 * It is NOT in the sidebar yet, and that is on purpose. A top-level Comms
 * section needs `lib/admin/nav.ts` to gate entries on a permission, which it
 * currently cannot do — nav filters on entitlements only (Phase 0 findings
 * §11-A). Adding the nav item before that gate exists would show a board
 * viewer a section they cannot open.
 */
export const dynamic = "force-dynamic";

export default async function CommsPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Comms" subtitle="Sign in to view comms." />
      </div>
    );
  }

  const supabase = createServerSupabase();
  const canManage = await hasPermission(supabase, ctx.orgId, "comms.manage");
  if (!canManage) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Comms" />
        <div className="bg-surface border border-hairline rounded-card-lg p-6 max-w-xl">
          <p className={TYPE.body}>
            You don&apos;t have access to Comms. Ask an owner or admin if you need it.
          </p>
        </div>
      </div>
    );
  }

  const { count } = await supabase
    .from("stories")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .neq("status", "retired");

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader
        title="Comms"
        subtitle="The story bank. Wins evaporate — this is where they stop evaporating."
      />
      <div className="bg-surface border border-hairline rounded-card-lg p-6 max-w-xl space-y-3">
        <p className={TYPE.body}>
          {count === 0
            ? "No stories captured yet."
            : `${count} ${count === 1 ? "story" : "stories"} in the bank.`}
        </p>
        <p className="text-sm text-ink-2 leading-relaxed">
          The bank list, the capture modal, and the consent panel arrive in Phase 2. The
          schema and the API are live now — capture writes through{" "}
          <code className="text-orange">POST /api/admin/comms/stories</code>.
        </p>
      </div>
    </div>
  );
}
