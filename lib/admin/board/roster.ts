/**
 * Board roster rules (V4 Stage G). PURE, so the server page and tests share
 * them: the officer role labels and each member's next step.
 */
export const ROLE_LABELS: Record<string, string> = {
  chair: "Chair",
  vice_chair: "Vice Chair",
  secretary: "Secretary",
  treasurer: "Treasurer",
  member: "Member",
};

type MemberLike = { status: string; coi_signed_at: string | null; term_end: string | null; constituent_id: string | null };

/** Pure: the member's next step, for the roster's next-step column. */
export function memberNextStep(
  member: MemberLike,
  coiYear: number,
  today: string,
): { text: string; tone: "late" | "due" | "quiet" } {
  if (member.status !== "active") return { text: "Past member", tone: "quiet" };
  if (member.term_end && member.term_end < today) return { text: "Term ended. Renew or mark past", tone: "late" };
  if (!member.coi_signed_at || member.coi_signed_at < `${coiYear}-01-01`) return { text: `Record the ${coiYear} conflict-of-interest form`, tone: "due" };
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 180 * 86400_000).toISOString().slice(0, 10);
  if (member.term_end && member.term_end <= soon) return { text: `Plan the renewal: term ends ${member.term_end}`, tone: "due" };
  if (!member.constituent_id) return { text: "Link to a donor record to track giving", tone: "quiet" };
  return { text: "Nothing due", tone: "quiet" };
}

