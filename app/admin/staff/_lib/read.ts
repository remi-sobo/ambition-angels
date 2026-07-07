import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";

/**
 * Staff module reads — session client only.
 *
 * This is the most sensitive data class in the app (Phases 2-3 add personal
 * goals and 360 reviews), so the whole module runs on the RLS-respecting session
 * client and NEVER on getSupabaseAdmin(). RLS ("members read staff", gated on
 * staff.read) is the hard boundary; the explicit hasPermission() check here just
 * turns "no access" into a clean message instead of a silently-empty chart.
 */

const SIGNED_URL_TTL = 60 * 5; // 5 minutes — mint fresh on each view.

export type StaffRow = {
  id: string;
  org_id: string;
  user_id: string;
  full_name: string;
  title: string | null;
  reports_to: string | null;
  department: string | null;
  employment_type: string;
  photo_path: string | null;
  start_date: string | null;
  status: string;
  sort_order: number;
};

export type StaffNode = StaffRow & { reports: StaffNode[] };

export type StaffTree = {
  roots: StaffNode[];
  /** Rows the tree couldn't place under a root (orphaned manager, cross-org). */
  orphans: StaffNode[];
  count: number;
};

const SELECT =
  "id, org_id, user_id, full_name, title, reports_to, department, employment_type, photo_path, start_date, status, sort_order";

/**
 * The org chart, assembled in app code from the flat staff rows. Returns null
 * when the caller is unauthenticated or lacks staff.read. Only `active` staff
 * are charted; inactive rows are kept in the table (review history) but hidden.
 */
export async function getStaffTree(): Promise<StaffTree | null> {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const supabase = createServerSupabase();
  if (!(await hasPermission(supabase, ctx.orgId, "staff.read"))) return null;

  const { data } = await supabase
    .from("staff")
    .select(SELECT)
    .eq("org_id", ctx.orgId)
    .eq("status", "active")
    .order("sort_order")
    .order("full_name");

  const rows = (data ?? []) as StaffRow[];
  return assembleTree(rows);
}

/**
 * Build parent/child from flat rows. Siblings keep the query order
 * (sort_order, then full_name). Defends against reporting cycles with a depth
 * cap even though the DB trigger already rejects them — a corrupt row must never
 * hang the render.
 */
export function assembleTree(rows: StaffRow[]): StaffTree {
  const byId = new Map<string, StaffNode>();
  for (const r of rows) byId.set(r.id, { ...r, reports: [] });

  const roots: StaffNode[] = [];
  const orphans: StaffNode[] = [];
  for (const node of Array.from(byId.values())) {
    if (node.reports_to == null) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(node.reports_to);
    if (parent) parent.reports.push(node);
    else orphans.push(node); // manager not in the active set (inactive/other org)
  }

  // Depth-cap guard: if a cycle somehow slipped past the trigger, cut it so the
  // page renders instead of recursing forever.
  const MAX_DEPTH = 100;
  const seen = new Set<string>();
  const walk = (node: StaffNode, depth: number) => {
    if (depth > MAX_DEPTH || seen.has(node.id)) {
      node.reports = [];
      return;
    }
    seen.add(node.id);
    node.reports.forEach((c) => walk(c, depth + 1));
  };
  roots.forEach((r) => walk(r, 0));

  return { roots, orphans, count: rows.length };
}

export type StaffMember = {
  member: StaffRow;
  managerName: string | null;
  photoUrl: string | null;
  /** Viewer may replace this person's photo (staff.write, or it's their own row). */
  canEditPhoto: boolean;
  /** Viewer may edit HR fields (title, manager, …). */
  canManage: boolean;
  isSelf: boolean;
  /** Viewer may see the sensitive tier (goals/KPIs/reviews): self, a manager
   *  above, or a staff.manage holder. Gates whether those sections render. */
  canViewSensitive: boolean;
};

export type StaffGoal = {
  id: string;
  staff_id: string;
  title: string;
  description: string | null;
  metric_type: string;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  period: string | null;
  target_date: string | null;
  linked_plan_goal_id: string | null;
  status: string;
  approval_status: string;
  sort_order: number;
};

export type StaffKpi = {
  id: string;
  staff_id: string;
  title: string;
  unit: string | null;
  target: number | null;
  current: number | null;
  cadence: string | null;
  source: string;
  linked_metric_key: string | null;
  status: string;
  last_updated_at: string | null;
  sort_order: number;
};

export type StaffDevelopment = { goals: StaffGoal[]; kpis: StaffKpi[] };

/**
 * A single person's profile. Returns null when unauthenticated, lacking
 * staff.read, or the id isn't a visible staff row in this org. The photo is
 * served through a short-lived signed URL minted here on the session client
 * (storage RLS gates it) — never a public URL.
 */
export async function getStaffMember(id: string): Promise<StaffMember | null> {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const supabase = createServerSupabase();
  if (!(await hasPermission(supabase, ctx.orgId, "staff.read"))) return null;

  const { data } = await supabase
    .from("staff")
    .select(SELECT)
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!data) return null;
  const member = data as StaffRow;

  let managerName: string | null = null;
  if (member.reports_to) {
    const { data: mgr } = await supabase
      .from("staff")
      .select("full_name")
      .eq("id", member.reports_to)
      .maybeSingle();
    managerName = (mgr as { full_name: string } | null)?.full_name ?? null;
  }

  let photoUrl: string | null = null;
  if (member.photo_path) {
    const { data: signed } = await supabase.storage
      .from("staff-photos")
      .createSignedUrl(member.photo_path, SIGNED_URL_TTL);
    photoUrl = signed?.signedUrl ?? null;
  }

  const canManage = await hasPermission(supabase, ctx.orgId, "staff.write");
  const isSelf = member.user_id === ctx.userId;

  // Ask the DB the same question the sensitive-tier policies ask.
  const { data: canView } = await supabase.rpc("can_view_staff", { p_staff_id: id });

  return {
    member,
    managerName,
    photoUrl,
    canEditPhoto: canManage || isSelf,
    canManage,
    isSelf,
    canViewSensitive: canView === true,
  };
}

/**
 * A person's goals + KPIs. RLS returns rows only where the caller can_view_staff,
 * so an unauthorized viewer gets empty lists; the profile page gates the whole
 * section on canViewSensitive so it never shows a misleadingly-empty tier.
 */
export async function getStaffDevelopment(staffId: string): Promise<StaffDevelopment> {
  const supabase = createServerSupabase();
  const [goalsRes, kpisRes] = await Promise.all([
    supabase
      .from("staff_goals")
      .select(
        "id, staff_id, title, description, metric_type, target_value, current_value, unit, period, target_date, linked_plan_goal_id, status, approval_status, sort_order"
      )
      .eq("staff_id", staffId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("staff_kpis")
      .select(
        "id, staff_id, title, unit, target, current, cadence, source, linked_metric_key, status, last_updated_at, sort_order"
      )
      .eq("staff_id", staffId)
      .order("sort_order")
      .order("created_at"),
  ]);
  return {
    goals: (goalsRes.data ?? []) as StaffGoal[],
    kpis: (kpisRes.data ?? []) as StaffKpi[],
  };
}
