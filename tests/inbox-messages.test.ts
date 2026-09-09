import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { V2_ROUTE_MAP, liveSeatFor, v2Href } from "@/lib/admin/v2routes";

// Spec Inbox, stage X1 — the shell's LAST unbuilt merge seat, built. House
// pins: a pure re-export host (decision 1 — the dark chrome and ?t= contract
// travel by construction), the V1 gate mirrored, and nothing moving until X2.

const app = join(__dirname, "..", "app");
const src = (...p: string[]) => readFileSync(join(app, ...p), "utf8");

const UUID = "0f68ab8c-1111-4222-8333-944444444444";

describe("X1 structural pins", () => {
  test("the host is a pure re-export — the chat, its chrome, and ?t= travel whole", () => {
    const s = src("admin", "inbox", "messages", "page.tsx");
    expect(s).toMatch(/export \{ default \} from "@\/app\/admin\/messages\/page"/);
    const layout = src("admin", "inbox", "messages", "layout.tsx");
    expect(layout).toMatch(/feature="modules\.messages"/);
  });

  test("dark-launched: the row stays at-cutover, the stored shapes stay live until X2", () => {
    const row = V2_ROUTE_MAP.find((r) => r.v1 === "/admin/messages")!;
    expect(row.v2).toBe("/admin/inbox/messages");
    expect(row.activation).toBe("at-cutover");
    // The merge seat still resolves to its V1 source pre-X2 (the shell keeps
    // linking the live screen), and the map's oldest contract holds.
    expect(liveSeatFor("/admin/inbox/messages")).toBe("/admin/messages");
    expect(v2Href(`/admin/messages?t=${UUID}`)).toBe(`/admin/messages?t=${UUID}`);
  });

  test("the V1 chat is untouched — its own dark shell, its own gate", () => {
    const page = src("admin", "messages", "page.tsx");
    expect(page).toMatch(/bg-ink/);
    expect(page).toMatch(/searchParams: \{ t\?: string \}/);
    const layout = src("admin", "messages", "layout.tsx");
    expect(layout).toMatch(/feature="modules\.messages"/);
  });
});
