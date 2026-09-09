import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Spec Work, stage W3 — Meetings absorbs the connections pipeline (decision
// 3, resolved: R2 binds connection_candidates to Work → Meetings). House
// structural pins: the queue moved, the V1 route stayed byte-identical, and
// nobody snuck the candidates into v_obligations on the way.

const app = join(__dirname, "..", "app");
const src = (...p: string[]) => readFileSync(join(app, ...p), "utf8");

describe("W3 structural pins", () => {
  test("the V1 connections route is a thin stub over the extracted ConnectionsSection", () => {
    const s = src("admin", "meetings", "connections", "page.tsx");
    expect(s).toMatch(/import ConnectionsSection from "\.\/ConnectionsSection"/);
    expect(s).toMatch(/<ConnectionsSection \/>/);
    expect(s).not.toMatch(/embedded/);
    expect(s).not.toMatch(/supabase/i);
    expect(s).toMatch(/force-dynamic/);
  });

  test("the section carries the moved pipeline, org-fenced, same reads", () => {
    const s = src("admin", "meetings", "connections", "ConnectionsSection.tsx");
    // The two reads travel as-is: the SCHEDULING_LABEL backlog and the
    // pending candidates, both scoped to the active org.
    expect(s).toMatch(/contains\("labels", \[SCHEDULING_LABEL\]\)/);
    expect(s).toMatch(/from\("connection_candidates"\)/);
    expect(s).toMatch(/eq\("status", "pending"\)/);
    const orgFences = s.match(/\.eq\("org_id", orgId\)/g) ?? [];
    expect(orgFences.length).toBe(2);
    // Suggest-then-confirm survives: queue, manual entry, backlog — all three.
    for (const c of ["<CandidatesQueue", "<NewConnectionForm", "<ConnectionsBacklog"]) {
      expect(s).toContain(c);
    }
  });

  test("Work → Meetings composes the V1 screen → the embedded pipeline, in that order", () => {
    const s = src("admin", "work", "meetings", "page.tsx");
    expect(s).toMatch(/import MeetingsPage from "@\/app\/admin\/meetings\/page"/);
    expect(s).toMatch(/<ConnectionsSection embedded \/>/);
    expect(s.indexOf("<MeetingsPage />")).toBeLessThan(s.indexOf("<ConnectionsSection embedded"));
    // The V1 meetings screen itself is rendered, not reimplemented.
    expect(s).not.toMatch(/meeting_records|listMeetings/);
  });

  test("Contract 3 stands: the candidates never join v_obligations from here", () => {
    for (const f of [
      src("admin", "meetings", "connections", "ConnectionsSection.tsx"),
      src("admin", "work", "meetings", "page.tsx"),
    ]) {
      // The comments cite the ruling; only an actual read would break it.
      expect(f).not.toMatch(/from\("v_obligations"\)|from\("v_action_items"\)/);
    }
  });
});
