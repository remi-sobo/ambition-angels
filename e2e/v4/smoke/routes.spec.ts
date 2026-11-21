import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { CANARIES } from "../fixtures/index.mjs";
import { resolveRoutes } from "./admin-routes";
import { ERROR_BOUNDARY, LOGS, MODULE_OFF, NOT_AUTHORIZED, NOT_FOUND, ORGS, setMock, type Org, type Role } from "./helpers";

/**
 * V4 Stage P: the two-org and role pass. Every admin route, as each role in
 * each org, at 1440. For every load:
 *  - no names from the other org anywhere on the page,
 *  - no crash (error boundary, dev overlay, 5xx),
 *  - a page the role cannot open shows the not-authorized panel (or the
 *    module-off panel for a module the org does not have), never a crash,
 *  - a board viewer sees no write controls,
 *  - an unknown route is a 404 inside the shell.
 * Writes e2e/v4/.logs/roles-<org>-<role>.json; `node e2e/v4/smoke/report.mjs`
 * turns them into the table.
 */

const ROLES: Role[] = (process.env.V4_ROLES?.split(",") as Role[]) ?? ["owner", "staff", "finance", "board_viewer"];

// Accessible names that change data. Shell controls every role has (search,
// Talk to log, report a problem, log out) are not in this list on purpose.
const WRITE = /^(\+\s*)?(New|Add|Create|Record|Edit|Delete|Remove|Save|Import|Upload|Invite|Mark|Enroll|Assign|Archive|Approve|Reject|Categorize|Reschedule|Change|Send|Schedule|Publish|Compile|Make the|Put it|Log a|Log gift|Connect|Disconnect|Sync|Run|Generate|Draft|Duplicate|Move|Promote|Dismiss|Snooze|Complete|Close the|Reopen|Restore|Undo|Upgrade)\b/i;
const SHELL_OK = /^(Talk to log|Search BloomOS|Report a problem|Log out|Capture|Mark all read)$/i;

test.describe.configure({ mode: "serial" });

for (const org of ORGS) {
  for (const role of ROLES) {
    test(`routes: ${org} as ${role}`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "the role pass runs at 1440");
      test.setTimeout(3 * 60 * 60 * 1000);
      await setMock({ org, role });
      const other: string[] = org === "a" ? CANARIES.b : CANARIES.a;
      const routes = resolveRoutes(org);
      const rows: Array<Record<string, unknown>> = [];
      for (const r of routes) {
        const row: Record<string, unknown> = { pattern: r.pattern, url: r.url, missingFixture: r.missing };
        let status = 0;
        try {
          const resp = await page.goto(r.url, { waitUntil: "load", timeout: 120_000 });
          status = resp?.status() ?? 0;
          await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
        } catch (e) {
          row.navError = String((e as Error).message).slice(0, 200);
        }
        const snap = await page
          .evaluate((writeSrc) => {
            const write = new RegExp(writeSrc, "i");
            const vis = (e: Element) => {
              const b = e.getBoundingClientRect();
              const s = getComputedStyle(e);
              return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && !(e as HTMLButtonElement).disabled;
            };
            const name = (e: Element) => (e.getAttribute("aria-label") || (e as HTMLElement).innerText || "").trim().replace(/\s+/g, " ");
            const controls = [...document.querySelectorAll("main button, main a[role=button], main a[href], main input[type=submit], main [role=menuitem]")]
              .filter(vis)
              .map(name)
              .filter((n) => n && write.test(n));
            const overlay = document.querySelector("nextjs-portal")?.shadowRoot?.textContent || "";
            return { text: document.body.innerText, controls: [...new Set(controls)], overlay: /Unhandled Runtime Error|Server Error/.test(overlay) };
          }, WRITE.source)
          .catch(() => ({ text: "", controls: [] as string[], overlay: false }));
        const final = new URL(page.url());
        row.status = status;
        row.finalPath = final.pathname + final.search;
        row.leaks = other.filter((c) => snap.text.includes(c));
        row.verdict = row.navError
          ? "nav-error"
          : ERROR_BOUNDARY.test(snap.text) || snap.overlay
            ? "crash"
            : status >= 500
              ? `http-${status}`
              : NOT_FOUND.test(snap.text)
                ? "not-found"
                : NOT_AUTHORIZED.test(snap.text)
                  ? "not-authorized"
                  : MODULE_OFF.test(snap.text)
                    ? "module-off"
                    : /Sign in/.test(snap.text) && final.pathname === "/admin"
                      ? "login"
                      : "ok";
        row.writeControls = role === "board_viewer" ? snap.controls.filter((n: string) => !SHELL_OK.test(n)) : snap.controls.length;
        rows.push(row);

        expect.soft(row.leaks, `${r.url}: other org's names`).toEqual([]);
        expect.soft(["crash", "nav-error"].includes(row.verdict as string) || String(row.verdict).startsWith("http-5"), `${r.url}: ${row.verdict}`).toBe(false);
        if (role === "board_viewer" && row.verdict === "ok") expect.soft(row.writeControls, `${r.url}: write controls for a board viewer`).toEqual([]);
        if (r.pattern.includes("[...not_found]")) {
          expect.soft(row.verdict, `${r.url}: unknown route`).toBe("not-found");
          expect.soft(status, `${r.url}: unknown route status`).toBe(404);
        }
      }
      // a route nobody defined, and the other org's record by id
      for (const extra of [
        { url: "/admin/no-such-page-v4", expect: "not-found" },
        { url: `/admin/fundraising/donors-funders/${resolveRoutes(org === "a" ? "b" : "a").find((x) => x.pattern.endsWith("donors-funders/[id]"))!.url.split("/").pop()}`, expect: "not-found|not-authorized" },
      ]) {
        const resp = await page.goto(extra.url, { waitUntil: "load" });
        const text = await page.evaluate(() => document.body.innerText);
        const verdict = NOT_FOUND.test(text) ? "not-found" : NOT_AUTHORIZED.test(text) ? "not-authorized" : ERROR_BOUNDARY.test(text) ? "crash" : "ok";
        rows.push({ pattern: "(extra)", url: extra.url, status: resp?.status(), verdict, leaks: other.filter((c) => text.includes(c)) });
        expect.soft(verdict, extra.url).toMatch(new RegExp(`^(${extra.expect})$`));
        expect.soft(other.filter((c) => text.includes(c)), `${extra.url}: other org's names`).toEqual([]);
      }
      fs.mkdirSync(LOGS, { recursive: true });
      fs.writeFileSync(path.join(LOGS, `roles-${org}-${role}.json`), JSON.stringify(rows, null, 1));
    });
  }
}
