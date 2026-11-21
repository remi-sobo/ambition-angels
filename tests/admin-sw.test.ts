import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

// Audit finding 8 (specs/v4-phase0/02-workflows-mobile.md): the admin service
// worker cached every /admin page it served, donor and minors' data included,
// and nothing cleared it on logout. These tests run the real worker source in
// a sandbox with a recording CacheStorage and assert it never stores an
// authenticated response, and that logout / org switch clear caches.

const ROOT = process.cwd();
const SW_SRC = readFileSync(join(ROOT, "public/admin-sw.js"), "utf8");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

type Listener = (event: unknown) => void;

function loadWorker(opts: { online: boolean }) {
  const writes: string[] = [];
  const deleted: string[] = [];
  const store = new Map<string, Map<string, Response>>([["bloomos-admin-v9", new Map()]]);
  const listeners: Record<string, Listener> = {};
  const cacheFor = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name)!;
    const key = (r: Request | string) => (typeof r === "string" ? r : r.url);
    return {
      put: async (r: Request | string, res: Response) => { writes.push(key(r)); m.set(key(r), res); },
      add: async (r: Request | string) => { writes.push(key(r)); },
      addAll: async (rs: (Request | string)[]) => { rs.forEach((r) => writes.push(key(r))); },
      match: async (r: Request | string) => m.get(key(r)),
    };
  };
  const caches = {
    open: async (n: string) => cacheFor(n),
    keys: async () => Array.from(store.keys()),
    delete: async (n: string) => { deleted.push(n); return store.delete(n); },
    match: async (r: Request | string) => {
      for (const n of Array.from(store.keys())) {
        const hit = await cacheFor(n).match(r);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  const fetchImpl = async (r: Request) => {
    if (!opts.online) throw new TypeError("Failed to fetch");
    const res = new Response(`<html>private page for ${r.url}</html>`, { status: 200 });
    Object.defineProperty(res, "type", { value: "basic" });
    return res;
  };
  const self = {
    location: { origin: "https://app.bloomos.org" },
    addEventListener: (t: string, fn: Listener) => { listeners[t] = fn; },
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
  };
  vm.runInNewContext(SW_SRC, { self, caches, fetch: fetchImpl, Response, Request, URL, Promise, console });

  async function dispatchFetch(url: string, init: { mode?: string; headers?: Record<string, string> } = {}) {
    const request = {
      url,
      method: "GET",
      mode: init.mode ?? "cors",
      headers: new Headers(init.headers ?? {}),
    };
    let responded: Promise<Response> | null = null;
    listeners.fetch({ request, respondWith: (p: Promise<Response>) => { responded = p; } });
    const res = responded ? await responded : null;
    await new Promise((r) => setTimeout(r, 0));
    return res as Response | null;
  }
  async function dispatch(type: string, data?: unknown) {
    const waits: Promise<unknown>[] = [];
    listeners[type]?.({ data, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }
  return { writes, deleted, store, dispatchFetch, dispatch };
}

const ORIGIN = "https://app.bloomos.org";

describe("admin service worker: no authenticated response is ever stored", () => {
  test("the cache version moved past v9 (existing installs drop their stored pages)", () => {
    const m = SW_SRC.match(/const CACHE = "bloomos-admin-v(\d+)"/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(9);
  });

  test("install precaches nothing (no cache.addAll of /admin)", async () => {
    const w = loadWorker({ online: true });
    await w.dispatch("install");
    expect(w.writes).toEqual([]);
  });

  test("activate deletes the old v9 cache", async () => {
    const w = loadWorker({ online: true });
    await w.dispatch("activate");
    expect(w.deleted).toContain("bloomos-admin-v9");
  });

  test("/admin navigations go to the network and are never written to a cache", async () => {
    const w = loadWorker({ online: true });
    for (const path of ["/admin", "/admin/fundraising/donors/123", "/admin/programs/students/9"]) {
      const res = await w.dispatchFetch(ORIGIN + path, { mode: "navigate" });
      expect(await res!.text()).toContain("private page");
    }
    expect(w.writes).toEqual([]);
  });

  test("/api responses and RSC payloads are not intercepted or stored", async () => {
    const w = loadWorker({ online: true });
    expect(await w.dispatchFetch(ORIGIN + "/api/admin/donors")).toBeNull();
    expect(await w.dispatchFetch(ORIGIN + "/admin/fundraising?_rsc=1", { headers: { RSC: "1" } })).toBeNull();
    expect(await w.dispatchFetch(ORIGIN + "/admin/manifest.webmanifest")).toBeNull();
    expect(w.writes).toEqual([]);
  });

  test("only immutable build assets and static icons are cached", async () => {
    const w = loadWorker({ online: true });
    await w.dispatchFetch(ORIGIN + "/_next/static/chunks/app.js");
    await w.dispatchFetch(ORIGIN + "/admin/icon-192.png");
    expect(w.writes).toEqual([ORIGIN + "/_next/static/chunks/app.js", ORIGIN + "/admin/icon-192.png"]);
  });

  test("offline navigation gets the generic offline page, never a stale copy", async () => {
    const w = loadWorker({ online: false });
    // Even if an old install left a page behind, it must not be served.
    w.store.get("bloomos-admin-v9")!.set(ORIGIN + "/admin/fundraising", new Response("stale donor page"));
    const res = await w.dispatchFetch(ORIGIN + "/admin/fundraising", { mode: "navigate" });
    expect(res!.status).toBe(503);
    const body = await res!.text();
    expect(body).toContain("You are offline");
    expect(body).toContain("nothing was saved");
    expect(body).not.toContain("stale donor page");
  });

  test("CLEAR_CACHES message deletes every cache", async () => {
    const w = loadWorker({ online: true });
    await w.dispatchFetch(ORIGIN + "/_next/static/chunks/app.js");
    await w.dispatch("message", { type: "CLEAR_CACHES" });
    expect(w.store.size).toBe(0);
  });

  test("no cache.put or addAll on a navigation or /api path in the source", () => {
    expect(SW_SRC).not.toMatch(/addAll\(/);
    const nav = SW_SRC.slice(SW_SRC.indexOf('req.mode === "navigate"'), SW_SRC.indexOf("isBuildAsset"));
    expect(nav).not.toMatch(/\.put\(/);
  });
});

describe("logout and org switch clear the worker's caches", () => {
  test("clearAdminCaches deletes every CacheStorage entry", async () => {
    const deleted: string[] = [];
    const g = globalThis as unknown as Record<string, unknown>;
    const prevWindow = g.window;
    g.window = { caches: { keys: async () => ["bloomos-admin-v9", "bloomos-admin-v10"], delete: async (k: string) => { deleted.push(k); return true; } } };
    try {
      const { clearAdminCaches } = await import("@/lib/admin/swCache");
      await clearAdminCaches();
    } finally {
      g.window = prevWindow;
    }
    expect(deleted).toEqual(["bloomos-admin-v9", "bloomos-admin-v10"]);
  });

  test.each([
    "app/admin/_components/v2/V2Sidebar.tsx",
    "app/admin/_components/LoginScreen.tsx",
    "app/admin/legacy/page.tsx",
    "app/admin/settings/_components/AccountControls.tsx",
    "app/admin/_components/OrgSwitcher.tsx",
  ])("%s calls clearAdminCaches", (file) => {
    expect(read(file)).toMatch(/await clearAdminCaches\(\)/);
  });

  test.each([
    "app/api/admin/logout/route.ts",
    "app/api/admin/account/signout-all/route.ts",
    "app/api/admin/org/switch/route.ts",
  ])("%s sends Clear-Site-Data: cache", (file) => {
    expect(read(file)).toContain(`"Clear-Site-Data", '"cache"'`);
  });

  test("the admin shell shows an offline indicator", () => {
    const src = read("app/admin/_components/AdminPWA.tsx");
    expect(src).toContain("navigator.onLine");
    expect(src).toContain("You are offline.");
  });
});
