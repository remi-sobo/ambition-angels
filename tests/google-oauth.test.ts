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

  it("prefers NEXT_PUBLIC_SITE_URL over the request origin for the redirect URI", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.ambitionangels.org/";
    expect(oauthRedirectUri("http://localhost:3000")).toBe(
      "https://www.ambitionangels.org/api/admin/agenda/connect-google/callback"
    );
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(oauthRedirectUri("http://localhost:3000")).toBe(
      "http://localhost:3000/api/admin/agenda/connect-google/callback"
    );
  });
});
