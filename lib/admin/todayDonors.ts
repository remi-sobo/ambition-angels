/**
 * V4 Stage C (spec §7): "donors who need me", PURE. The loader reads the
 * donors assigned to the signed-in person (constituents.owner_id = me, plus
 * donors whose open ask names me by the older text owner) with their gifts
 * and open asks; this ranks the ones that need a touch:
 *
 *   late      an open ask's next step is past due
 *   unthanked a gift is still waiting for its thank-you
 *   lapsing   gave before, but nothing in the last 12 months
 *   stepless  an open ask with no next step at all
 *
 * One row per donor, the most urgent reason first. Tests:
 * tests/today-panels.test.ts.
 */

export type DonorRow = { id: string; name: string };
export type DonorGift = { constituent_id: string; gift_date: string; amount: number; acknowledgment_status: string | null };
export type DonorAsk = { constituent_id: string; next_step: string | null; next_step_due: string | null; stage: string };

export type DonorNeed = {
  id: string;
  name: string;
  reason: "late" | "unthanked" | "lapsing" | "stepless";
  why: string;
  action: string;
  href: string;
  urgent: boolean;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

const OPEN = new Set(["identify", "qualify", "cultivate", "solicit"]);
const RANK: Record<DonorNeed["reason"], number> = { late: 0, unthanked: 1, lapsing: 2, stepless: 3 };

export function donorsNeedingMe(
  donors: readonly DonorRow[],
  gifts: readonly DonorGift[],
  asks: readonly DonorAsk[],
  today: string,
): DonorNeed[] {
  const out: DonorNeed[] = [];
  for (const d of donors) {
    const href = `/admin/fundraising/donors-funders/${d.id}`;
    const mine = gifts.filter((g) => g.constituent_id === d.id);
    const open = asks.filter((a) => a.constituent_id === d.id && OPEN.has(a.stage));

    const late = open
      .filter((a) => a.next_step?.trim() && a.next_step_due && a.next_step_due < today)
      .sort((a, b) => (a.next_step_due! < b.next_step_due! ? -1 : 1))[0];
    if (late) {
      const n = daysBetween(late.next_step_due!, today);
      out.push({
        id: d.id, name: d.name, reason: "late", urgent: true, href, action: "Open",
        why: `Next step "${late.next_step!.trim()}" is ${n} day${n === 1 ? "" : "s"} late`,
      });
      continue;
    }

    const unthanked = mine.filter((g) => g.acknowledgment_status === "pending").sort((a, b) => (a.gift_date < b.gift_date ? -1 : 1))[0];
    if (unthanked) {
      out.push({
        id: d.id, name: d.name, reason: "unthanked", urgent: true, href, action: "Thank",
        why: `${usd(unthanked.amount)} gift on ${unthanked.gift_date} is not thanked yet`,
      });
      continue;
    }

    const last = [...mine].sort((a, b) => (a.gift_date > b.gift_date ? -1 : 1))[0];
    if (last && daysBetween(last.gift_date, today) > 365) {
      out.push({
        id: d.id, name: d.name, reason: "lapsing", urgent: true, href, action: "Call",
        why: `Lapsing. Last gift ${usd(last.amount)}, ${monthYear(last.gift_date)}`,
      });
      continue;
    }

    if (open.length > 0 && open.every((a) => !a.next_step?.trim())) {
      out.push({
        id: d.id, name: d.name, reason: "stepless", urgent: false, href, action: "Add step",
        why: "Open ask with no next step",
      });
    }
  }
  return out.sort((a, b) => RANK[a.reason] - RANK[b.reason] || a.name.localeCompare(b.name));
}
