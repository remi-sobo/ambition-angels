import { describe, expect, test } from "vitest";
import {
  computePartnerKpis,
  isActivePartner,
  type PartnerKpiInput,
} from "../app/admin/partners/_lib/kpis";

// Fixed clock so the 90-day MOU window and 30-day stale-touch cutoff are
// deterministic: today = 2026-08-12, in90 = 2026-11-10, cut30 = 2026-07-13.
const NOW = new Date("2026-08-12T12:00:00Z");

const partner = (over: Partial<PartnerKpiInput>): PartnerKpiInput => ({
  status: "prospect",
  mou_status: "none",
  mou_end: null,
  last_touch_at: null,
  ...over,
});

describe("isActivePartner", () => {
  test("active and anchor count; every other stage does not", () => {
    expect(isActivePartner({ status: "active" })).toBe(true);
    expect(isActivePartner({ status: "anchor" })).toBe(true);
    for (const s of ["prospect", "outreach", "pilot", "lapsed"]) {
      expect(isActivePartner({ status: s })).toBe(false);
    }
  });
});

describe("computePartnerKpis", () => {
  test("buckets statuses: active/anchor vs emerging vs prospects vs live", () => {
    const k = computePartnerKpis(
      [
        partner({ status: "active", last_touch_at: "2026-08-10" }),
        partner({ status: "anchor", last_touch_at: "2026-08-10" }),
        partner({ status: "outreach" }),
        partner({ status: "pilot" }),
        partner({ status: "prospect" }),
        partner({ status: "lapsed" }),
      ],
      NOW
    );
    expect(k.active).toBe(2);
    expect(k.emerging).toBe(2);
    expect(k.prospects).toBe(1);
    expect(k.live).toBe(5); // everyone but lapsed
  });

  test("stale touch: active partner quiet 30+ days or never touched", () => {
    const k = computePartnerKpis(
      [
        partner({ status: "active", last_touch_at: "2026-06-01" }), // stale
        partner({ status: "anchor", last_touch_at: null }), // never → stale
        partner({ status: "active", last_touch_at: "2026-08-01" }), // fresh
        partner({ status: "outreach", last_touch_at: null }), // not active → ignored
      ],
      NOW
    );
    expect(k.staleTouch).toBe(2);
  });

  test("MOU windows: expired vs expiring-in-90 vs beyond; lapsed orgs ignored", () => {
    const k = computePartnerKpis(
      [
        partner({ status: "active", mou_status: "signed", mou_end: "2026-07-01", last_touch_at: "2026-08-10" }), // expired
        partner({ status: "active", mou_status: "signed", mou_end: "2026-09-01", last_touch_at: "2026-08-10" }), // expiring
        partner({ status: "active", mou_status: "signed", mou_end: "2027-06-01", last_touch_at: "2026-08-10" }), // fine
        partner({ status: "lapsed", mou_status: "signed", mou_end: "2026-07-01" }), // lapsed → ignored
        partner({ status: "active", mou_status: "none", mou_end: "2026-09-01", last_touch_at: "2026-08-10" }), // unsigned → ignored
      ],
      NOW
    );
    expect(k.mouExpired).toBe(1);
    expect(k.mouExpiring).toBe(1);
  });

  test("empty list is all zeros", () => {
    expect(computePartnerKpis([], NOW)).toEqual({
      live: 0, active: 0, emerging: 0, prospects: 0,
      mouExpiring: 0, mouExpired: 0, staleTouch: 0,
    });
  });
});
