// Pure KPI counts + the "active" predicate for the partners list. Shared by
// the workspace (stat boxes double as filters) and unit tests, so the number
// on the "Active partners" card and the rows the click reveals can never
// disagree on what "active" means.

import type { Partner } from "./partners";

export type PartnerKpiInput = Pick<
  Partner,
  "status" | "mou_status" | "mou_end" | "last_touch_at"
>;

export const isActivePartner = (p: Pick<Partner, "status">) =>
  p.status === "active" || p.status === "anchor";

export type PartnerKpis = {
  live: number;
  active: number;
  emerging: number;
  prospects: number;
  mouExpiring: number;
  mouExpired: number;
  staleTouch: number;
};

export function computePartnerKpis(
  partners: readonly PartnerKpiInput[],
  now: Date = new Date()
): PartnerKpis {
  const today = now.toISOString().slice(0, 10);
  const in90 = new Date(now.getTime() + 90 * 86400_000).toISOString().slice(0, 10);
  const cut30 = new Date(now.getTime() - 30 * 86400_000).toISOString().slice(0, 10);

  const k: PartnerKpis = {
    live: 0, active: 0, emerging: 0, prospects: 0,
    mouExpiring: 0, mouExpired: 0, staleTouch: 0,
  };
  for (const p of partners) {
    const live = p.status !== "lapsed";
    if (live) k.live++;
    if (isActivePartner(p)) {
      k.active++;
      // Active but quiet for 30+ days (or never touched) → needs a touch.
      if (!p.last_touch_at || p.last_touch_at < cut30) k.staleTouch++;
    }
    if (p.status === "outreach" || p.status === "pilot") k.emerging++;
    if (p.status === "prospect") k.prospects++;
    if (live && p.mou_status === "signed" && p.mou_end) {
      if (p.mou_end < today) k.mouExpired++;
      else if (p.mou_end <= in90) k.mouExpiring++;
    }
  }
  return k;
}
