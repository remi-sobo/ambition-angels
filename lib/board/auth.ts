import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * Board portal auth (spec §4).
 *
 * Magic link only. No passwords, no account creation, no reset path — every
 * password is a reason a volunteer director does not log in, and adoption is
 * the whole game here.
 *
 * Two roles:
 *  - board_viewer  reads everything under /board
 *  - board_admin   additionally runs the live meeting and answers questions.
 *    "board_admin" is not a membership role of its own; it is anyone holding
 *    board.write (owner/admin — Remi and Shannon). Driving it off the
 *    permission rather than a UI toggle is deliberate: the design prototype
 *    had a "Chair controls" switch in the account menu, and the V2 audit
 *    called it an invented pattern to delete in the build. The chair simply
 *    IS the chair.
 */

export type BoardContext = {
  orgId: string;
  email: string;
  /** The director's row on the roster. Null for a signed-in staffer who is
   *  not on the board roster at all (they still see the portal read-only). */
  memberId: string | null;
  memberName: string | null;
  isStaff: boolean;
  /** Holds board.write — runs the meeting, answers questions. */
  isAdmin: boolean;
};

export type RosterMember = {
  id: string;
  name: string;
  email: string | null;
  officer_role: string;
  title: string | null;
  term_start: string | null;
  term_end: string | null;
  is_voting: boolean;
  is_staff: boolean;
  /** Current-year conflict-of-interest state. `signed_at` is often null even
   *  when status is 'signed': the 2026 cycle is recorded as signed by four
   *  directors without dates, and the portal prints what it knows. */
  coi_status: "signed" | "outstanding" | "not_required" | null;
  coi_signed_at: string | null;
};

/** The signed-in director's context, or null when not signed in / not a
 *  member of the org. React-cached: layout and page both call it. */
export const getBoardContext = cache(async (): Promise<BoardContext | null> => {
  const ctx = await getOrgContext();
  if (!ctx) return null;

  const supabase = createServerSupabase();
  // RLS applies: board.read is required to see the roster at all.
  const { data: member } = await supabase
    .from("board_members")
    .select("id, name, is_staff")
    .eq("org_id", ctx.orgId)
    .eq("status", "active")
    .ilike("email", ctx.email)
    .maybeSingle();

  const { data: perm } = await supabase
    .from("role_permissions")
    .select("permission")
    .eq("role", ctx.role)
    .eq("permission", "board.write")
    .maybeSingle();

  const { data: canRead } = await supabase
    .from("role_permissions")
    .select("permission")
    .eq("role", ctx.role)
    .eq("permission", "board.read")
    .maybeSingle();

  if (!canRead) return null;

  return {
    orgId: ctx.orgId,
    email: ctx.email,
    memberId: member?.id ?? null,
    memberName: (member?.name as string | undefined) ?? null,
    isStaff: !!member?.is_staff,
    isAdmin: !!perm,
  };
});

/**
 * Is this email on the board roster?
 *
 * The one place the service-role client is correct on the sign-in path: the
 * caller has no session yet, so there is no RLS identity to check against.
 * The answer NEVER reaches the client — /api/board/signin returns the same
 * confirmation screen either way and simply sends nothing when this is false.
 * Never reveal who is on the roster.
 */
export async function isOnRoster(email: string): Promise<{ ok: boolean; orgId: string | null }> {
  const clean = email.trim().toLowerCase();
  if (!clean) return { ok: false, orgId: null };
  const { data } = await getSupabaseAdmin()
    .from("board_members")
    .select("org_id")
    .eq("status", "active")
    .ilike("email", clean)
    .maybeSingle();
  return { ok: !!data, orgId: (data?.org_id as string | undefined) ?? null };
}

/** Full roster for /board/people, with this year's COI state. */
export async function getRoster(orgId: string): Promise<RosterMember[]> {
  const supabase = createServerSupabase();
  const year = new Date().getFullYear();

  const [{ data: rows }, { data: coi }] = await Promise.all([
    supabase
      .from("board_members")
      .select("id, name, email, officer_role, title, term_start, term_end, is_voting, is_staff")
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("is_staff")
      .order("name"),
    supabase
      .from("coi_disclosures")
      .select("board_member_id, status, signed_at")
      .eq("org_id", orgId)
      .eq("year", year),
  ]);

  const byMember = new Map(
    ((coi ?? []) as { board_member_id: string; status: RosterMember["coi_status"]; signed_at: string | null }[]).map(
      (c) => [c.board_member_id, c],
    ),
  );

  return ((rows ?? []) as Omit<RosterMember, "coi_status" | "coi_signed_at">[]).map((m) => {
    const c = byMember.get(m.id);
    return {
      ...m,
      coi_status: m.is_staff ? "not_required" : (c?.status ?? null),
      coi_signed_at: c?.signed_at ?? null,
    };
  });
}

/** Initials for an avatar: "Lara Sellers" → "LS". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
