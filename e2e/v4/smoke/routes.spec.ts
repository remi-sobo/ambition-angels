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

// Board-viewer write controls that are allowed, or known and listed in
// specs/v4-pilot-scorecard.md for a screen migration (the server refuses
// every one of these writes for a board viewer; the button should not show).
// Keyed by route pattern; the value matches the control names to let pass.
const BOARD_VIEWER_ALLOWED: Array<[RegExp, RegExp, string]> = [
  [/^\/admin\/capture\/\[id\]$/, /./, "allowed: voice capture is on for every role (capture.use)"],
  [/^\/admin\/inbox$/, /^New (task|gift)/, "false positive: notification titles"],
  [/^\/admin\/(staff|organization\/team)\/\[id\]$/, /^(Upload|Replace) photo$/, "allowed: the record opened is the viewer's own (fixture), and anyone may set their own photo"],
  [/^\/admin\/(organization\/)?board(\/\[id\])?$/, /^(Add member|New meeting|Mark past|Edit profile)$/, "known: board.read sees board.write buttons"],
  [/^\/admin\/(organization\/strategy|strategic-plan)(\/|$)|^\/admin\/settings\/organization\/strategy-setup$/, /./, "known: strategy editors shown to read-only roles"],
  [/^\/admin\/(impact\/kpis|kpis|strategic-plan\/scorecard)$/, /^\+ add note$/, "known: KPI note button shown without metrics.write"],
  [/^\/admin\/(inbox\/)?messages$/, /^New$/, "known: New message without messages.write"],
  [/^\/admin\/settings$/, /^(Connect Google Calendar|Import a CSV|Sync now)$/, "known: Settings home shows setup actions to every role"],
  [/^\/admin\/demoday$/, /^(Connect|New Media Ventures)/, "false positive: partner links on the AA demo day page"],
];


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
        // /admin/kit is a static gallery of invented examples that happen to use
        // the demo org's names; it reads no data.
        row.leaks = r.pattern === "/admin/kit" ? [] : other.filter((c) => snap.text.includes(c));
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
        if (role === "board_viewer") {
          const all = snap.controls.filter((n: string) => !SHELL_OK.test(n));
          const allow = BOARD_VIEWER_ALLOWED.filter(([route]) => route.test(r.pattern));
          row.writeControls = all.filter((n: string) => !allow.some(([, names]) => names.test(n)));
          const passed = all.filter((n: string) => allow.some(([, names]) => names.test(n)));
          if (passed.length) row.writeControlsAllowed = { names: passed, why: allow.map(([, , why]) => why) };
        } else row.writeControls = snap.controls.length;
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
