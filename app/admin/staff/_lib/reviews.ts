import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";

/**
 * Staff 360 reviews — session-client reads (RLS is the boundary). The profile and
 * admin pages read feedback through v_review_feedback_visible, never the base
 * review_feedback table, so anonymous cycles get their rater identity masked.
 */

export type ReviewCycle = {
  id: string;
  name: string;
  status: string;
  anonymity_mode: string;
  min_raters_for_anonymity: number;
  rating_scale_max: number;
  opens_on: string | null;
  closes_on: string | null;
};

export type ReviewCompetency = { id: string; name: string; description: string | null; sort_order: number };

export type RaterForm = {
  id: string;
  cycle_id: string;
  subject_staff_id: string;
  subject_name: string;
  relationship: string;
  status: string;
  ratings: Record<string, number>;
  strengths: string | null;
  growth: string | null;
  comments: string | null;
};

export type VisibleFeedback = {
  id: string;
  relationship: string;
  status: string;
  rater_staff_id: string | null;
  rater_name: string | null;
  ratings: Record<string, number>;
  strengths: string | null;
  growth: string | null;
  comments: string | null;
};

async function myStaffId(supabase: SupabaseClient, userId: string, orgId: string): Promise<string | null> {
  const { data } = await supabase
    .from("staff")
    .select("id")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export type ReviewsAdminData = {
  cycles: ReviewCycle[];
  competencies: ReviewCompetency[];
  canManage: boolean;
};

/** Cycle list + competencies for the reviews admin. Null when unauthenticated. */
export async function getReviewsAdminData(): Promise<ReviewsAdminData | null> {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const supabase = createServerSupabase();
  if (!(await hasPermission(supabase, ctx.orgId, "staff.read"))) return null;

  const [cyclesRes, compsRes, canManage] = await Promise.all([
    supabase
      .from("review_cycles")
      .select("id, name, status, anonymity_mode, min_raters_for_anonymity, rating_scale_max, opens_on, closes_on")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("review_competencies")
      .select("id, name, description, sort_order")
      .eq("org_id", ctx.orgId)
      .eq("active", true)
      .order("sort_order"),
    hasPermission(supabase, ctx.orgId, "staff.manage"),
  ]);

  return {
    cycles: (cyclesRes.data ?? []) as ReviewCycle[],
    competencies: (compsRes.data ?? []) as ReviewCompetency[],
    canManage,
  };
}

/** The forms the CURRENT user must fill for a cycle (rater = me). RLS already
 *  scopes review_feedback to the rater, so this returns only their own. */
export async function getMyRaterForms(cycleId: string): Promise<RaterForm[]> {
  const ctx = await getOrgContext();
  if (!ctx) return [];
  const supabase = createServerSupabase();
  const mine = await myStaffId(supabase, ctx.userId, ctx.orgId);
  if (!mine) return [];

  const { data } = await supabase
    .from("review_feedback")
    .select("id, cycle_id, subject_staff_id, relationship, status, ratings, strengths, growth, comments, staff!review_feedback_subject_staff_id_fkey(full_name)")
    .eq("cycle_id", cycleId)
    .eq("rater_staff_id", mine)
    .order("relationship");

  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as RaterForm & { staff: { full_name: string } | null };
    return {
      id: row.id,
      cycle_id: row.cycle_id,
      subject_staff_id: row.subject_staff_id,
      subject_name: row.staff?.full_name ?? "—",
      relationship: row.relationship,
      status: row.status,
      ratings: (row.ratings ?? {}) as Record<string, number>,
      strengths: row.strengths,
      growth: row.growth,
      comments: row.comments,
    };
  });
}

/** Active competencies for the org (the "how" axis), for rendering rating rows. */
export async function getReviewCompetencies(): Promise<ReviewCompetency[]> {
  const ctx = await getOrgContext();
  if (!ctx) return [];
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("review_competencies")
    .select("id, name, description, sort_order")
    .eq("org_id", ctx.orgId)
    .eq("active", true)
    .order("sort_order");
  return (data ?? []) as ReviewCompetency[];
}

export type SubjectReviewCycle = {
  cycle: ReviewCycle;
  summary: string | null;
  summaryShared: boolean;
  feedback: VisibleFeedback[];
  managerNotes: string | null;
  /** Viewer may write the synthesis (a manager above, or staff.manage — not the subject). */
  canSynthesize: boolean;
};

/**
 * All review cycles touching a subject, shaped for the profile Reviews section.
 * Feedback comes from the masking view; summaries and notes obey their own RLS
 * (subject sees a shared summary; only managers see notes). `canSynthesize`
 * decides whether the synthesis editor + notes render.
 */
export async function getSubjectReviews(subjectStaffId: string): Promise<SubjectReviewCycle[]> {
  const ctx = await getOrgContext();
  if (!ctx) return [];
  const supabase = createServerSupabase();
  const mine = await myStaffId(supabase, ctx.userId, ctx.orgId);
  const isSelf = mine === subjectStaffId;
  const canManageOrg = await hasPermission(supabase, ctx.orgId, "staff.manage");
  const { data: canView } = await supabase.rpc("can_view_staff", { p_staff_id: subjectStaffId });
  const canSynthesize = (canView === true && !isSelf) || (canManageOrg && !isSelf);

  // Feedback for this subject, via the masking view; join rater names where present.
  const { data: fbData } = await supabase
    .from("v_review_feedback_visible")
    .select("id, cycle_id, relationship, status, rater_staff_id, ratings, strengths, growth, comments")
    .eq("subject_staff_id", subjectStaffId);
  const feedbackRows = (fbData ?? []) as (VisibleFeedback & { cycle_id: string })[];

  // Resolve rater names for the non-masked rows.
  const raterIds = Array.from(
    new Set(feedbackRows.map((f) => f.rater_staff_id).filter((x): x is string => !!x))
  );
  const nameById = new Map<string, string>();
  if (raterIds.length) {
    const { data: names } = await supabase.from("staff").select("id, full_name").in("id", raterIds);
    for (const n of (names ?? []) as { id: string; full_name: string }[]) nameById.set(n.id, n.full_name);
  }

  const [cyclesRes, summariesRes, notesRes] = await Promise.all([
    supabase
      .from("review_cycles")
      .select("id, name, status, anonymity_mode, min_raters_for_anonymity, rating_scale_max, opens_on, closes_on")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false }),
    supabase.from("review_summaries").select("cycle_id, summary, shared_at").eq("subject_staff_id", subjectStaffId),
    canSynthesize
      ? supabase.from("review_manager_notes").select("cycle_id, notes").eq("subject_staff_id", subjectStaffId)
      : Promise.resolve({ data: [] as { cycle_id: string; notes: string | null }[] }),
  ]);

  const summaryByCycle = new Map<string, { summary: string | null; shared: boolean }>();
  for (const s of (summariesRes.data ?? []) as { cycle_id: string; summary: string | null; shared_at: string | null }[]) {
    summaryByCycle.set(s.cycle_id, { summary: s.summary, shared: !!s.shared_at });
  }
  const notesByCycle = new Map<string, string | null>();
  for (const n of (notesRes.data ?? []) as { cycle_id: string; notes: string | null }[]) {
    notesByCycle.set(n.cycle_id, n.notes);
  }

  // Only surface cycles where this subject actually has feedback, a summary, or
  // the viewer can synthesize (so an admin sees empty cycles to work in).
  const cycles = (cyclesRes.data ?? []) as ReviewCycle[];
  const result: SubjectReviewCycle[] = [];
  for (const cycle of cycles) {
    const fb = feedbackRows
      .filter((f) => f.cycle_id === cycle.id)
      .map((f) => ({
        id: f.id,
        relationship: f.relationship,
        status: f.status,
        rater_staff_id: f.rater_staff_id,
        rater_name: f.rater_staff_id ? nameById.get(f.rater_staff_id) ?? null : null,
        ratings: (f.ratings ?? {}) as Record<string, number>,
        strengths: f.strengths,
        growth: f.growth,
        comments: f.comments,
      }));
    const sum = summaryByCycle.get(cycle.id);
    const hasAnything = fb.length > 0 || sum !== undefined || canSynthesize;
    if (!hasAnything) continue;
    result.push({
      cycle,
      summary: sum?.summary ?? null,
      summaryShared: sum?.shared ?? false,
      feedback: fb,
      managerNotes: canSynthesize ? notesByCycle.get(cycle.id) ?? null : null,
      canSynthesize,
    });
  }
  return result;
}
