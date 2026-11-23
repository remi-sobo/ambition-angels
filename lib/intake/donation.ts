import { adminUrl } from "@/lib/origins";
import { clean, esc, notifyAddress, sendMail } from "./notify";
import type { KindHandler } from "./types";

/**
 * Donor details after a website checkout (was app/api/save-donation).
 * Needs the intake:donations scope and modules.fundraising.
 *
 * Upserted by stripe_payment_id within the org: the website sends the donor's
 * name and email once the payment succeeds. Monthly renewals still arrive via
 * the Stripe webhook, which BloomOS keeps.
 */

export type DonationInput = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  amount: number;
  recurring: boolean;
  stripe_payment_id: string;
  subscription_id: string | null;
};

export const donation: KindHandler<DonationInput> = {
  scope: "intake:donations",
  entitlement: "modules.fundraising",
  validate(body) {
    const amount = Number(body.amount);
    const stripe_payment_id = clean(body.stripePaymentId ?? body.stripe_payment_id, 120);
    if (!Number.isFinite(amount) || amount <= 0 || !stripe_payment_id) {
      return { ok: false, error: "Missing required fields" };
    }
    const legacy = clean(body.name, 200);
    const first = clean(body.firstName ?? body.first_name, 120) || (legacy ? legacy.split(" ")[0] : "");
    const last = clean(body.lastName ?? body.last_name, 120) || (legacy ? legacy.split(" ").slice(1).join(" ") : "");
    const email = clean(body.email, 200);
    return {
      ok: true,
      data: {
        first_name: first || null,
        last_name: last || null,
        email: email || null,
        amount,
        recurring: body.recurring === true,
        stripe_payment_id,
        subscription_id: clean(body.subscriptionId ?? body.subscription_id, 120) || null,
      },
    };
  },
  async run(ctx, d) {
    const { data: existing, error: findErr } = await ctx.db
      .from("donations")
      .select("id")
      .eq("org_id", ctx.org.id)
      .eq("stripe_payment_id", d.stripe_payment_id)
      .maybeSingle();
    if (findErr) throw new Error(`donations read: ${findErr.message}`);

    let id: string;
    if (existing) {
      const { error } = await ctx.db
        .from("donations")
        .update({ first_name: d.first_name, last_name: d.last_name, email: d.email })
        .eq("id", existing.id)
        .eq("org_id", ctx.org.id);
      if (error) throw new Error(`donations update: ${error.message}`);
      id = existing.id as string;
    } else {
      const { data, error } = await ctx.db
        .from("donations")
        .insert({ ...d, org_id: ctx.org.id, status: "succeeded" })
        .select("id")
        .single();
      if (error || !data) throw new Error(`donations insert: ${error?.message ?? "no row"}`);
      id = data.id as string;

      const to = notifyAddress(ctx.org);
      if (to) {
        const donor = [d.first_name, d.last_name].filter(Boolean).join(" ") || "Anonymous";
        await sendMail(ctx.org, {
          to,
          subject: `💸 New donation: $${d.amount.toFixed(2)}${d.recurring ? " /mo" : ""}`,
          html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">
  <strong>New donation</strong><br><br>
  Donor: ${esc(donor)}<br>
  Email: ${esc(d.email || "—")}<br>
  Amount: $${d.amount.toFixed(2)} (${d.recurring ? "Monthly recurring" : "One-time"})<br>
  Stripe ID: ${esc(d.stripe_payment_id)}<br><br>
  <a href="${adminUrl("/admin/donations")}">See it in BloomOS</a>
</div>`,
        });
      }
    }
    return { id };
  },
};
