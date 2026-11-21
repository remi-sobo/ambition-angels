import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { resolveRoutes } from "./admin-routes";
import { LOGS, gotoAdmin, setMock, writesSince } from "./helpers";

/**
 * V4 Stage P: WCAG 2.2 AA with axe-core on every admin route, as the demo
 * org's owner, at 1440 and 390. Findings go to e2e/v4/.logs/a11y-<vp>.json
 * (route, rule, impact, how many nodes, one target). The run fails only on
 * rules listed in BLOCKING, which are the ones fixed in Stage P and must stay
 * fixed; everything else is reported for the screen migrations to pick up.
 * Plus a keyboard pass: the Pipeline board and the shell menus without a mouse.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const BLOCKING = new Set((process.env.V4_A11Y_BLOCKING ?? "button-name,label,select-name,link-name,image-alt,aria-allowed-role,aria-prohibited-attr,aria-progressbar-name,aria-command-name,duplicate-id-aria,frame-title,document-title,html-has-lang,link-in-text-block,label-content-name-mismatch,landmark-main-is-top-level,landmark-no-duplicate-main").split(","));

test("axe on every route", async ({ page }, info) => {
  test.setTimeout(3 * 60 * 60 * 1000);
  await setMock({ org: "a", role: "owner" });
  const rows: Array<Record<string, unknown>> = [];
  const only = process.env.V4_ONLY;
  for (const r of resolveRoutes("a").filter((x) => !only || x.url.includes(only))) {
    try {
      await page.goto(r.url, { waitUntil: "load", timeout: 120_000 });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      const res = await new AxeBuilder({ page }).withTags(TAGS).exclude("nextjs-portal").analyze();
      for (const v of res.violations) {
        rows.push({ route: r.pattern, url: r.url, rule: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, target: v.nodes[0]?.target?.join(" "), html: v.nodes[0]?.html?.slice(0, 160) });
        if (BLOCKING.has(v.id)) expect.soft(v.nodes.map((n) => n.target.join(" ")), `${r.url}: ${v.id} (${v.help})`).toEqual([]);
      }
    } catch (e) {
      rows.push({ route: r.pattern, url: r.url, rule: "load-error", error: String((e as Error).message).slice(0, 200) });
    }
  }
  fs.mkdirSync(LOGS, { recursive: true });
  fs.writeFileSync(path.join(LOGS, `a11y-${info.project.name}.json`), JSON.stringify(rows, null, 1));
});

test("keyboard: Pipeline board and shell menus without a mouse", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard pass at 1440");
  await setMock({ org: "a", role: "owner" });
  await gotoAdmin(page, "/admin/fundraising/pipeline");

  // Tab reaches a board card (an <article> per ask), with visible focus.
  let reached = "";
  for (let i = 0; i < 120 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return a?.closest("main article") ? a.closest("article")!.getAttribute("aria-label") || "card" : "";
    });
  }
  expect(reached, "Tab reaches a Pipeline card").not.toBe("");
  const ring = await page.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    const s = getComputedStyle(a);
    return (s.outlineStyle !== "none" && s.outlineWidth !== "0px") || s.boxShadow !== "none";
  });
  expect(ring, "focus is visible on the focused card control").toBe(true);

  // Keep tabbing inside the card to its stage control, and move it with the keyboard.
  let select = false;
  for (let i = 0; i < 8 && !select; i++) {
    select = await page.evaluate(() => /^Move .* to another stage$/.test(document.activeElement?.getAttribute("aria-label") || ""));
    if (!select) await page.keyboard.press("Tab");
  }
  expect(select, "a keyboard way to move a card between stages").toBe(true);
  const since = Date.now();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => writesSince(since).filter((w) => w.table === "opportunities").length, { timeout: 20_000 }).toBeGreaterThan(0);

  // Shell: the "More actions" style menus open with Enter and close with Escape.
  await gotoAdmin(page, "/admin/programs/people");
  const menu = page.getByRole("button", { name: "More actions" }).first();
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem")).toHaveCount(0);
  await expect(menu).toBeFocused();
});
