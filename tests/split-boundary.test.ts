import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import nextConfig from "../next.config.mjs";

// The repo split (specs/bloomos-repo-split.md). This site holds no BloomOS
// database key of any kind: its only way into BloomOS is the intake key. And
// every old BloomOS address people may still click lands on app.bloomos.org.

describe("no BloomOS database key", () => {
  test("no website code reads a BloomOS Supabase env var", () => {
    let hits = "";
    try {
      hits = execFileSync(
        "git",
        ["grep", "-lE", "NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)|[^_]SUPABASE_SERVICE_ROLE_KEY|getResidentOrgId|INTAKE_MODE|SITE_DB=", "--", "app", "components", "lib", "middleware.ts", "next.config.mjs", "scripts"],
        { encoding: "utf8" },
      );
    } catch {
      // git grep exits 1 when nothing matches: that is the pass.
    }
    expect(hits.split("\n").filter(Boolean)).toEqual([]);
  });
});

describe("old BloomOS links", () => {
  test("board, meet, strategy, coach pages, unsubscribe and booking links 308 to app.bloomos.org, path kept", async () => {
    const redirects = await nextConfig.redirects!();
    for (const source of [
      "/board",
      "/board/:path*",
      "/meet",
      "/meet/:path*",
      "/strategy",
      "/coach/me/:token",
      "/api/unsubscribe",
      "/api/meet/booking/:token/:action",
    ]) {
      expect(redirects, source).toContainEqual({ source, destination: `https://app.bloomos.org${source}`, permanent: true });
    }
  });

  test("the public coach sign-up page stays on the website", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects.find((r) => r.source === "/coach")).toBeUndefined();
  });

  test("only the website's own cron is scheduled", () => {
    const crons = JSON.parse(readFileSync(join(__dirname, "..", "vercel.json"), "utf8")).crons as { path: string }[];
    expect(crons.map((c) => c.path)).toEqual(["/api/site/cron/intake-outbox"]);
  });
});
