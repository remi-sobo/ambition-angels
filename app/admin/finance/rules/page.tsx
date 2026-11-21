import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import type { FinCategory } from "@/lib/finance/types";
import RulesEditor from "./_components/RulesEditor";
import NoCategories from "../_components/NoCategories";
import PageHeader from "../../_components/PageHeader";
import PageShell from "../../_components/ui/PageShell";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

type Rule = {
  id: string;
  pattern: string;
  pattern_type: "contains" | "starts_with" | "regex";
  category_id: string;
  restricted: boolean;
  priority: number;
  enabled: boolean;
  hit_count: number;
};

export default async function RulesPage() {
  const roleGate = await requirePagePermission("finance.read", "Finance");
  if (!roleGate.ok) return roleGate.page;
  const supabase = getSupabaseAdmin();

  // Org fence: the service-role client bypasses RLS, so every read below is
  // scoped to the active org. No session → nothing to show.
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <PageShell width="reading">
        <PageHeader title="Rules" subtitle="Sign in to view categorization rules." />
      </PageShell>
    );
  }
  const orgId = ctx.orgId;

  const [{ data: catsRaw }, { data: rulesRaw }] = await Promise.all([
    supabase
      .from("fin_categories")
      .select("id, group_name, display_name, kind, functional_class, sort_order, enabled")
      .eq("org_id", orgId)
      .eq("enabled", true)
      .order("sort_order"),
    supabase
      .from("fin_category_rules")
      .select("id, pattern, pattern_type, category_id, restricted, priority, enabled, hit_count")
      .eq("org_id", orgId)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const categories = (catsRaw ?? []) as FinCategory[];
  const rules = (rulesRaw ?? []) as Rule[];

  const subtitle =
    "Rules run on every CSV import and on demand against uncategorized transactions. The highest priority match wins, then the newest. A broken pattern is skipped, so one bad rule never stops an import.";

  // Settings archetype (V4 Stage G2): reading width; the header lives in the
  // client editor so its primary action can open the drawer.
  return (
    <PageShell width="reading">
      {categories.length === 0 ? (
        <>
          <PageHeader title="Category rules" subtitle={subtitle} />
          <NoCategories />
        </>
      ) : (
        <RulesEditor initialRules={rules} categories={categories} subtitle={subtitle} />
      )}
    </PageShell>
  );
}
