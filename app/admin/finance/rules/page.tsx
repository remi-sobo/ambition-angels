import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import type { FinCategory } from "@/lib/finance/types";
import RulesEditor from "./_components/RulesEditor";
import PageHeader from "../../_components/PageHeader";

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
  const supabase = getSupabaseAdmin();

  // Org fence: the service-role client bypasses RLS, so every read below is
  // scoped to the active org. No session → nothing to show.
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="max-w-6xl px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Rules" subtitle="Sign in to view categorization rules." />
      </div>
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

  return (
    <div className="max-w-6xl px-4 lg:px-8 py-6 lg:py-8">
      <header className="mb-2">
        <div className="flex items-center gap-3 text-xs text-ink-2 mb-1">
          <Link href="/admin/finance" className="hover:text-ink-1">
            ← Finance
          </Link>
        </div>
        <PageHeader
          title="Category rules"
          subtitle={
            <span className="block max-w-2xl">
              Rules run automatically on every CSV import and on demand against
              uncategorized transactions. First match wins by priority; ties are
              broken by recency. Bad regex patterns are silently skipped at
              match-time so a single broken rule doesn&apos;t poison an import.
            </span>
          }
        />
      </header>

      <RulesEditor initialRules={rules} categories={categories} />
    </div>
  );
}
