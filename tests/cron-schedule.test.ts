import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every cron route is either scheduled in vercel.json or listed here as
 * intentionally unscheduled, with the reason (pre-SafeSpace item 10). A new
 * route under app/api/cron/ that is neither fails CI, so a job can no longer
 * sit unscheduled without anyone deciding that it should.
 */
const INTENTIONALLY_UNSCHEDULED: Record<string, string> = {
  journeys:
    "No journey is active and its Comms home arrives in V4 Stage D. The code stays; it sends Resend email to constituents once scheduled.",
};

const ROOT = join(__dirname, "..");
const CRON_DIR = join(ROOT, "app/api/cron");

type Cron = { path: string; schedule: string };
const crons: Cron[] = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")).crons;
const routes = readdirSync(CRON_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(CRON_DIR, d.name, "route.ts")))
  .map((d) => d.name)
  .sort();
const scheduled = new Map(crons.map((c) => [c.path.replace(/^\/api\/cron\//, ""), c.schedule]));

describe("cron routes are scheduled or deliberately not", () => {
  test("every route under app/api/cron is in vercel.json or on the unscheduled list", () => {
    const orphans = routes.filter((r) => !scheduled.has(r) && !(r in INTENTIONALLY_UNSCHEDULED));
    expect(orphans).toEqual([]);
  });

  test("no route is both scheduled and on the unscheduled list", () => {
    expect(routes.filter((r) => scheduled.has(r) && r in INTENTIONALLY_UNSCHEDULED)).toEqual([]);
  });

  test("every unscheduled entry names a real route and gives a reason", () => {
    for (const [name, reason] of Object.entries(INTENTIONALLY_UNSCHEDULED)) {
      expect(routes, name).toContain(name);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  test("every vercel.json entry points at an existing cron route", () => {
    // The Ambition Angels website's own crons live under /api/site/cron (repo
    // split §6a) so they leave with the website; they're checked below.
    for (const c of crons.filter((c) => !c.path.startsWith("/api/site/cron/"))) {
      expect(c.path).toMatch(/^\/api\/cron\/[a-z0-9-]+$/);
      expect(routes, c.path).toContain(c.path.replace("/api/cron/", ""));
      expect(c.schedule.trim().split(/\s+/)).toHaveLength(5);
    }
  });

  test("website crons point at an existing /api/site/cron route", () => {
    const site = crons.filter((c) => c.path.startsWith("/api/site/cron/"));
    expect(site.map((c) => c.path)).toContain("/api/site/cron/intake-outbox");
    for (const c of site) {
      expect(existsSync(join(ROOT, "app", ...c.path.split("/").filter(Boolean), "route.ts")), c.path).toBe(true);
      expect(c.schedule.trim().split(/\s+/)).toHaveLength(5);
    }
  });

  test("the four restored jobs run at the agreed UTC times (Remi is in Pacific)", () => {
    expect(scheduled.get("daily-reminders")).toBe("7 15 * * *");
    expect(scheduled.get("weekly-digest")).toBe("23 15 * * 1");
    expect(scheduled.get("meet-reminders")).toBe("12 * * * *");
    expect(scheduled.get("stewardship-milestones")).toBe("37 14 * * *");
  });

  test("HubSpot sync runs every 10 minutes inside one daily hour, and starts at most one sync a day", () => {
    expect(scheduled.get("hubspot-sync")).toBe("*/10 22 * * *");
    const src = readFileSync(join(CRON_DIR, "hubspot-sync", "route.ts"), "utf8");
    expect(src).toContain("FRESH_FOR_MS");
    expect(src).toMatch(/started_at[\s\S]*FRESH_FOR_MS/);
  });

  test("every job that emails people checks the notify.operator_emails opt-in", () => {
    for (const r of ["daily-reminders", "weekly-digest", "meet-reminders"]) {
      const src = readFileSync(join(CRON_DIR, r, "route.ts"), "utf8");
      expect(src, r).toContain("loadOperatorEmailOrgs");
    }
  });
});
