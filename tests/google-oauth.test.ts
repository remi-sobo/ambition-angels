import { describe, it, expect, beforeEach } from "vitest";
import { buildConsentUrl, oauthRedirectUri } from "@/lib/google/oauth";

// The Settings → Connect Google Calendar flow must send the user through
// Google's own account chooser — never silently authenticate a hardcoded
// account (the bug where Connect instantly attached remi@ambitionangels.org).
describe("google calendar consent URL", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.APP_ORIGIN;
  });

  it("forces the account chooser and offline access", () => {
    const url = new URL(buildConsentUrl("https://example.org", "state123"));
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("prompt")).toBe("consent select_account");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.org/api/admin/agenda/connect-google/callback"
    );
  });

  it("never pre-selects an account via login_hint", () => {
    const url = new URL(buildConsentUrl("https://example.org", "s"));
    expect(url.searchParams.get("login_hint")).toBeNull();
    expect(url.toString()).not.toContain("ambitionangels.org");
  });

  it("builds the redirect URI from APP_ORIGIN (admin host), never the marketing origin", () => {
    // APP_ORIGIN (the admin host) wins, so a user on the admin domain gets a
    // redirect_uri Google will accept — even when the marketing site URL differs.
    process.env.APP_ORIGIN = "https://app.bloomos.org";
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.ambitionangels.org/";
    expect(oauthRedirectUri("http://localhost:3000")).toBe(
      "https://app.bloomos.org/api/admin/agenda/connect-google/callback"
    );

    // With no APP_ORIGIN, fall back to the LIVE request origin — the host the
    // flow is actually running on — and never the marketing NEXT_PUBLIC_SITE_URL.
    delete process.env.APP_ORIGIN;
    expect(oauthRedirectUri("http://localhost:3000")).toBe(
      "http://localhost:3000/api/admin/agenda/connect-google/callback"
    );
  });
});
