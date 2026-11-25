import { describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import Stripe from "stripe";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/orgs", () => ({ getResidentOrgId: async () => "org-aa" }));

// Repo split §6b: after the split BloomOS holds STRIPE_WEBHOOK_SECRET but not
// STRIPE_SECRET_KEY (that stays with the website's checkout). The webhook
// must load and verify signatures without the secret key.
describe("stripe webhook without STRIPE_SECRET_KEY", () => {
  test("loads, rejects a bad signature, accepts a good one", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_only");
    const { POST } = await import("@/app/api/stripe-webhook/route");

    const body = JSON.stringify({ id: "evt_1", object: "event", type: "ping.unhandled", data: { object: {} } });
    const post = (sig: string) =>
      POST(new NextRequest("https://app.bloomos.org/api/stripe-webhook", { method: "POST", body, headers: { "stripe-signature": sig } }));

    expect((await post("t=1,v1=nope")).status).toBe(400);

    // The types mark every option required; Stripe fills timestamp, scheme
    // and signature itself when they're left out.
    const opts = { payload: body, secret: "whsec_test_only" } as Parameters<typeof Stripe.webhooks.generateTestHeaderString>[0];
    const good = Stripe.webhooks.generateTestHeaderString(opts);
    expect((await post(good)).status).not.toBe(400);
    vi.unstubAllEnvs();
  });
});
