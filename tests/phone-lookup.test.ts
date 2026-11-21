import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanLookupQuery, donorFigures, mailHref, pickNextStep, telHref } from "@/lib/admin/lookup";

// V4 Stage C (spec §10): look someone up on a phone.

describe("lookup helpers", () => {
  test("queries are cleaned for PostgREST and need two letters", () => {
    expect(cleanLookupQuery("Dana (Whitfield), *")).toBe("Dana Whitfield");
    expect(cleanLookupQuery("d")).toBeNull();
    expect(cleanLookupQuery(undefined)).toBeNull();
  });
  test("call and email links only for usable values", () => {
    expect(telHref("(415) 555-0134")).toBe("tel:4155550134");
    expect(telHref("+1 415 555 0134")).toBe("tel:+14155550134");
    expect(telHref("12")).toBeNull();
    expect(mailHref("dana@example.org")).toBe("mailto:dana@example.org");
    expect(mailHref("not an email")).toBeNull();
  });
  test("the next step is the earliest dated one, else the first undated", () => {
    expect(
      pickNextStep([
        { text: "Undated", due: null, source: "task", context: null },
        { text: "Later", due: "2026-12-01", source: "ask", context: null },
        { text: "Sooner", due: "2026-11-09", source: "ask", context: null },
      ])?.text,
    ).toBe("Sooner");
    expect(pickNextStep([{ text: "  ", due: null, source: "task", context: null }])).toBeNull();
  });
  test("figures say where they came from, and missing is not zero", () => {
    const f = donorFigures(
      [
        { amount: 10000, gift_date: "2026-10-03", acknowledgment_status: "sent" },
        { amount: 5000, gift_date: "2026-02-01", acknowledgment_status: "sent" },
        { amount: 12000, gift_date: "2025-06-01", acknowledgment_status: "sent" },
      ],
      "2026-11-21",
    );
    expect(f.lifetime).toEqual({ value: 27000, source: "3 gifts, as of now" });
    expect(f.last.value).toBe(10000);
    expect(f.thisYear.value).toBe(15000);
    expect(f.thisYear.source).toBe("Last year $12,000");
    const none = donorFigures([], "2026-11-21");
    expect(none.lifetime.value).toBeNull();
    expect(none.last.value).toBeNull();
  });
});

describe("source guards: lookup", () => {
  const src = readFileSync(join(process.cwd(), "app/admin/lookup/page.tsx"), "utf8");
  test("session client only, every read fenced to the active org", () => {
    expect(src).not.toMatch(/lib\/supabase\/admin|getSupabaseAdmin/);
    const froms = src.match(/\.from\("/g)?.length ?? 0;
    expect(src.match(/\.eq\("org_id", (ctx\.orgId|orgId)\)/g)?.length).toBe(froms);
  });
  test("donors need fundraising.read and students program.read", () => {
    expect(src).toMatch(/ctxHasPermission\(ctx, "fundraising\.read"\)/);
    expect(src).toMatch(/ctxHasPermission\(ctx, "program\.read"\)/);
    expect(src).toMatch(/q && canStudents/);
    expect(src).toMatch(/q && canDonors/);
  });
  test("no contact buttons for students, and do-not-contact hides them for donors", () => {
    const studentBlock = src.slice(src.indexOf('aria-label="Students"'), src.indexOf("async function DonorCard"));
    expect(studentBlock).not.toMatch(/tel:|mailto:|telHref|mailHref/);
    expect(src).toMatch(/c\.do_not_contact \? null : telHref/);
    expect(src).toMatch(/c\.do_not_contact \? null : mailHref/);
  });
  test("44px targets on every tappable control", () => {
    const links = src.match(/<(Link|a|button)\b[^>]*className="[^"]*"/g) ?? [];
    for (const l of links) expect(l, l).toMatch(/min-h-\[44px\]|min-h-\[52px\]|h-11|\$\{BTN\}/);
  });
});
