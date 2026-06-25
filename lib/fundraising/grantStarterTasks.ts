import type { TaskPriority } from "@/app/admin/ops/_types/ops";

/**
 * Starter-task templates for a grant's workspace project (Grant workspace,
 * Phase 4). Seeding a grant drops this checklist into its project as real
 * ops_tasks so the operator starts from the grant lifecycle, not a blank list.
 *
 * Per-org by design: this is core BloomOS SaaS surface, not an AA convenience.
 * The DEFAULT below is the generic grant lifecycle every funder shares; it
 * deliberately avoids AA-specific process. A tenant that runs grants
 * differently registers its own template in PER_ORG keyed by org_id, and
 * getGrantStarterTasks resolves to it — so AA's (or anyone's) process can never
 * leak into another tenant.
 */

export type StarterTask = { title: string; priority: TaskPriority };

const DEFAULT_GRANT_STARTER_TASKS: readonly StarterTask[] = [
  { title: "Draft the letter of inquiry (LOI)", priority: "high" },
  { title: "Build the project budget", priority: "high" },
  { title: "Write the grant narrative", priority: "medium" },
  { title: "Internal review and sign-off", priority: "medium" },
  { title: "Submit the application", priority: "high" },
  { title: "Report on the grant", priority: "low" },
];

// Per-org overrides, keyed by org_id. Empty by default: everyone inherits the
// generic baseline until they opt into their own checklist here.
const PER_ORG_GRANT_STARTER_TASKS: Record<string, readonly StarterTask[]> = {};

export function getGrantStarterTasks(orgId: string): readonly StarterTask[] {
  return PER_ORG_GRANT_STARTER_TASKS[orgId] ?? DEFAULT_GRANT_STARTER_TASKS;
}
