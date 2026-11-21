import EmptyState from "../../_components/EmptyState";

/**
 * Shown when the active org has no finance categories. Categories are per-org
 * (fin_categories_org_scope.sql) and a new org starts with none until an
 * operator loads a chart (fin_seed_starter_categories), so budget, rules and
 * categorization render this instead of an empty editor.
 */
export default function NoCategories() {
  return (
    <EmptyState
      label="Finance categories"
      hint="Your organization's chart of categories has not been loaded yet. It is set up for you during onboarding; budgets, rules and categorizing transactions start working as soon as it is in."
    />
  );
}
