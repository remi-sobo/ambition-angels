import { describe, expect, test, vi } from "vitest";
import { mockSupabase } from "./support/supabaseMock";

// Repo split §6e item 4: the "Website admin" sidebar link. It needs BOTH the
// aa.site_admin entitlement and an https website_admin_url on the org row.

let db = mockSupabase([]);
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => db.client }));
vi.mock("@/lib/admin/auth", () => ({ getOrgContext: vi.fn(async () => null) }));

import { getWebsiteAdminUrl, parseWebsiteAdminUrl } from "@/lib/admin/websiteAdmin";
import { FEATURE_KEYS } from "@/lib/admin/entitlements";

describe("website admin link", () => {
  test("the two new AA-only keys are in the vocabulary", () => {
    expect(FEATURE_KEYS).toContain("aa.site_admin");
    expect(FEATURE_KEYS).toContain("aa.site_signals");
  });

  test("only absolute https URLs are accepted", () => {
    expect(parseWebsiteAdminUrl("https://www.ambitionangels.org/admin")).toBe("https://www.ambitionangels.org/admin");
    expect(parseWebsiteAdminUrl("http://example.org/admin")).toBeNull();
    expect(parseWebsiteAdminUrl("javascript:alert(1)")).toBeNull();
    expect(parseWebsiteAdminUrl("/admin")).toBeNull();
    expect(parseWebsiteAdminUrl(42)).toBeNull();
    expect(parseWebsiteAdminUrl(undefined)).toBeNull();
  });

  test("no aa.site_admin → no link, and no org read", async () => {
    db = mockSupabase([{ data: { settings: { website_admin_url: "https://x.org/admin" } } }]);
    expect(await getWebsiteAdminUrl("org-yl", new Set(["modules.program"]))).toBeNull();
    expect(db.calls.from).toHaveLength(0);
  });

  test("aa.site_admin with a URL on the org → the link", async () => {
    db = mockSupabase([{ data: { settings: { website_admin_url: "https://www.ambitionangels.org/admin" } } }]);
    expect(await getWebsiteAdminUrl("org-aa", new Set(["aa.site_admin"]))).toBe("https://www.ambitionangels.org/admin");
    expect(db.calls.eq).toContainEqual(["id", "org-aa"]);
  });

  test("aa.site_admin without a URL → no link", async () => {
    db = mockSupabase([{ data: { settings: {} } }]);
    expect(await getWebsiteAdminUrl("org-aa", new Set(["aa.site_admin"]))).toBeNull();
  });
});
