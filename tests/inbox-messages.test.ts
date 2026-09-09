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

  test("X2: the contract discharged — the stored shapes land in-thread at the seat", () => {
    const row = V2_ROUTE_MAP.find((r) => r.v1 === "/admin/messages")!;
    expect(row.v2).toBe("/admin/inbox/messages");
    expect(row.activation).toBe("now");
    // The last merge seat self-resolves, and the map's oldest contract is
    // discharged, not deleted: both stored notifications.url shapes
    // translate, ?t= riding the 308.
    expect(liveSeatFor("/admin/inbox/messages")).toBe("/admin/inbox/messages");
    expect(v2Href("/admin/messages")).toBe("/admin/inbox/messages");
    expect(v2Href(`/admin/messages?t=${UUID}`)).toBe(`/admin/inbox/messages?t=${UUID}`);
  });

  test("the V1 chat is untouched — its own dark shell, its own gate", () => {
    const page = src("admin", "messages", "page.tsx");
    expect(page).toMatch(/bg-ink/);
    expect(page).toMatch(/searchParams: \{ t\?: string \}/);
    const layout = src("admin", "messages", "layout.tsx");
    expect(layout).toMatch(/feature="modules\.messages"/);
  });
});
