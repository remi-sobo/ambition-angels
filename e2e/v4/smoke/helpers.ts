import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
// The fixtures are plain ESM; Node 24 loads them synchronously from here.
import { buildTwoOrgFixtures, CANARIES } from "../fixtures/index.mjs";

export const MOCK = process.env.V4_MOCK ?? "http://127.0.0.1:55352";
export const LOGS = path.resolve(__dirname, "../.logs");
export type Org = "a" | "b";
export type Role = "owner" | "admin" | "staff" | "finance" | "board_viewer";
export const ORGS: Org[] = ["a", "b"];
export const ORG_LABEL: Record<Org, string> = { a: "Ambition Angels (demo)", b: "Lanternfield Youth Alliance (demo)" };

type MockCfg = { org?: Org; role?: Role; profile?: "populated" | "empty"; failWrite?: string | null; failRead?: string | null; delayMs?: number };

/** Point the mock at one org/role, with a fresh store (writes from earlier
 *  tests dropped) and no forced failures unless asked. */
export async function setMock(cfg: MockCfg) {
  const body = { twoOrg: true, org: "a", role: "owner", profile: "populated", failWrite: null, failRead: null, delayMs: 0, persist: true, reset: true, ...cfg };
  const r = await fetch(`${MOCK}/__mock/config`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`mock config failed: ${r.status}`);
}
export async function patchMock(cfg: Partial<MockCfg>) {
  await fetch(`${MOCK}/__mock/config`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cfg) });
}

/** The same fixture store the mock holds, for ids and names. */
export function fixtures(org: Org, role: Role = "owner") {
  return buildTwoOrgFixtures({ profile: "populated", role, org }) as {
    tables: Record<string, Array<Record<string, any>>>;
    user: { id: string; displayName: string };
    team: Array<{ id: string; displayName: string }>;
    orgId: string;
  };
}

/** Writes the app sent to the mock since `since` (the mock logs every one). */
export function writesSince(since: number, table?: string) {
  const f = path.join(LOGS, "writes.jsonl");
  if (!fs.existsSync(f)) return [];
  return fs
    .readFileSync(f, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { at: string; method: string; table: string; query: string; body: unknown })
    .filter((w) => Date.parse(w.at) >= since && (!table || w.table === table));
}

/** Counts the clicks (desktop) or taps (phone) a flow takes. Typing,
 *  scrolling and the keyboard are free; every pointer action goes through here. */
export class Clicks {
  n = 0;
  log: string[] = [];
  constructor(private page: Page, private phone: boolean) {}
  async on(target: Locator, label?: string) {
    this.n++;
    this.log.push(label ?? String(target));
    await target.scrollIntoViewIfNeeded().catch(() => {});
    if (this.phone) await target.tap();
    else await target.click();
  }
  reset() {
    this.n = 0;
    this.log = [];
  }
}

/** Visible text must hold none of the other org's names. */
export async function expectNoOtherOrg(page: Page, org: Org) {
  const text = await page.evaluate(() => document.body.innerText);
  const other = org === "a" ? CANARIES.b : CANARIES.a;
  const hits = other.filter((c: string) => text.includes(c));
  expect(hits, `names from the other org on ${page.url()}`).toEqual([]);
}

export const NOT_AUTHORIZED = /You don.t have access to this page/;
export const MODULE_OFF = /This module isn.t enabled/;
export const NOT_FOUND = /There.s no page here/;
export const ERROR_BOUNDARY = /Something broke on this page|Unhandled Runtime Error|Application error/;

export async function gotoAdmin(page: Page, url: string) {
  const resp = await page.goto(url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  return resp;
}

/** Waits for a toast (role=status or alert) carrying text and returns it. */
export async function toastText(page: Page, timeout = 15_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const txt = (await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => [] as string[]))
      .map((x) => x.trim())
      .filter(Boolean)
      .join(" | ");
    if (txt) return txt;
    await page.waitForTimeout(200);
  }
  return "";
}

/** A results file per suite: smoke counts, the role table, a11y findings. */
export function record(file: string, row: Record<string, unknown>) {
  fs.mkdirSync(LOGS, { recursive: true });
  fs.appendFileSync(path.join(LOGS, file), JSON.stringify({ at: new Date().toISOString(), ...row }) + "\n");
}

export const isPhone = (info: TestInfo) => info.project.name === "phone";
