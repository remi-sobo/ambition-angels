"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { trackEvent } from "@/lib/analytics";
import {
  Elements,
  CardElement,
  PaymentRequestButtonElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

import type { Stripe, PaymentRequest } from "@stripe/stripe-js";

const CARD_STYLE = {
  style: {
    base: {
      color: "#0E0E0E",
      fontFamily: "'Helvetica Neue', sans-serif",
      fontSize: "15px",
      fontSmoothing: "antialiased",
      "::placeholder": { color: "#9CA3AF" },
    },
    invalid: { color: "#EF4444" },
  },
};

const PRESETS = [
  { amount: 25,    label: "$25",    desc: "Get a teen started exploring careers" },
  { amount: 100,   label: "$100",   desc: "Fund 1 teen's full internship" },
  { amount: 500,   label: "$500",   desc: "Fund 5 teens on Ambition" },
  { amount: 1000,  label: "$1,000", desc: "Fund a full classroom cohort" },
];

// Processing-fee gross-up so the org nets the donor's intended amount.
const FEE_PCT = 0.029;
const FEE_FIXED = 0.3;
const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });

// ── Inner form (needs Stripe context) ──────────────────────────────────────

interface FormProps {
  onClose: () => void;
}

function DonateForm({ onClose }: FormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [amount, setAmount] = useState<number>(100);
  const [customAmount, setCustomAmount] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [coverFee, setCoverFee] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [otherWaysOpen, setOtherWaysOpen] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);

  const baseAmount = useCustom ? Math.max(1, parseFloat(customAmount) || 0) : amount;
  const feePreview = Math.max(0, Math.round(((baseAmount + FEE_FIXED) / (1 - FEE_PCT) - baseAmount) * 100) / 100);
  const feeAmount = coverFee ? feePreview : 0;
  const chargedAmount = Math.round((baseAmount + feeAmount) * 100) / 100;
  const displayAmount = fmtUsd(chargedAmount);

  // Record + receipt + success, shared by the card and wallet paths.
  const finalize = useCallback(
    async (opts: {
      paymentId: string; isRecurring: boolean; subscriptionId?: string;
      fn: string; ln: string; em: string; amount: number;
    }) => {
      await Promise.allSettled([
        fetch("/api/save-donation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: opts.fn, lastName: opts.ln, email: opts.em, amount: opts.amount,
            recurring: opts.isRecurring, stripePaymentId: opts.paymentId, subscriptionId: opts.subscriptionId,
          }),
        }),
        opts.em && fetch("/api/send-receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${opts.fn} ${opts.ln}`.trim(), email: opts.em, amount: opts.amount, recurring: opts.isRecurring }),
        }),
      ]);
      trackEvent("donation_completed", { amount: opts.amount, recurring: opts.isRecurring });
      setSuccess(true);
    },
    []
  );

  // ── Apple / Google Pay (one-time only) ──
  // Latest charged amount in a ref so the persistent paymentmethod handler
  // never reads a stale closure when presets / cover-fee change.
  const chargedRef = useRef(chargedAmount);
  useEffect(() => { chargedRef.current = chargedAmount; }, [chargedAmount]);

  useEffect(() => {
    if (!stripe) return;
    const pr = stripe.paymentRequest({
      country: "US",
      currency: "usd",
      total: { label: "Ambition Angels donation", amount: Math.round(chargedRef.current * 100) },
      requestPayerName: true,
      requestPayerEmail: true,
    });
    pr.canMakePayment().then((res) => { if (res) setPaymentRequest(pr); });

    pr.on("paymentmethod", async (ev) => {
      try {
        const amt = chargedRef.current;
        const res = await fetch("/api/create-payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amt, name: ev.payerName, email: ev.payerEmail, recurring: false }),
        });
        const data = await res.json();
        if (!res.ok) { ev.complete("fail"); setError(data.error || "Payment failed"); return; }

        const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
          data.clientSecret, { payment_method: ev.paymentMethod.id }, { handleActions: false }
        );
        if (confirmError) { ev.complete("fail"); setError(confirmError.message ?? "Payment failed"); return; }
        ev.complete("success");

        if (paymentIntent && paymentIntent.status === "requires_action") {
          const { error: actionErr } = await stripe.confirmCardPayment(data.clientSecret);
          if (actionErr) { setError(actionErr.message ?? "Payment failed"); return; }
        }

        const parts = (ev.payerName ?? "").trim().split(/\s+/);
        await finalize({
          paymentId: paymentIntent!.id, isRecurring: false,
          fn: parts[0] ?? "", ln: parts.slice(1).join(" "), em: ev.payerEmail ?? "", amount: amt,
        });
      } catch (err) {
        ev.complete("fail");
        setError(err instanceof Error ? err.message : "Payment failed");
      }
    });
  }, [stripe, finalize]);

  // Keep the wallet sheet's total in sync with the chosen amount.
  useEffect(() => {
    if (paymentRequest) {
      paymentRequest.update({ total: { label: "Ambition Angels donation", amount: Math.round(chargedAmount * 100) } });
    }
  }, [chargedAmount, paymentRequest]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!stripe || !elements) return;
      if (chargedAmount < 1) { setError("Please enter a valid amount."); return; }
      if (!firstName || !email) { setError("First name and email are required."); return; }

      setLoading(true);
      setError(null);

      const card = elements.getElement(CardElement);
      if (!card) { setLoading(false); return; }
      const fullName = `${firstName} ${lastName}`.trim();

      try {
        if (recurring) {
          const { paymentMethod, error: pmError } = await stripe.createPaymentMethod({
            type: "card", card, billing_details: { name: fullName, email },
          });
          if (pmError) throw new Error(pmError.message);

          const res = await fetch("/api/create-payment-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: chargedAmount, name: fullName, email, recurring: true, paymentMethodId: paymentMethod!.id }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to set up subscription");

          if (data.clientSecret) {
            const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret);
            if (confirmError) throw new Error(confirmError.message);
            await finalize({
              paymentId: paymentIntent?.id ?? data.subscriptionId, isRecurring: true, subscriptionId: data.subscriptionId,
              fn: firstName, ln: lastName, em: email, amount: chargedAmount,
            });
          }
        } else {
          const res = await fetch("/api/create-payment-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: chargedAmount, name: fullName, email, recurring: false }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to create payment");

          const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret, {
            payment_method: { card, billing_details: { name: fullName, email } },
          });
          if (confirmError) throw new Error(confirmError.message);

          await finalize({
            paymentId: paymentIntent!.id, isRecurring: false,
            fn: firstName, ln: lastName, em: email, amount: chargedAmount,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [stripe, elements, chargedAmount, firstName, lastName, email, recurring, finalize]
  );

  // Success screen
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-8 px-4">
        <div className="w-16 h-16 rounded-full bg-orange/10 border-2 border-orange flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="font-heading font-bold text-2xl text-ink mb-3">
          Thank you{firstName ? `, ${firstName}` : ""}.
        </h3>
        <p className="text-gray-warm text-base leading-relaxed mb-2 max-w-sm">
          Your gift of <strong className="text-ink">${displayAmount}</strong> is already going to work.
        </p>
        {email && (
          <p className="text-gray-warm text-sm leading-relaxed mb-8 max-w-sm">
            We&apos;ll send a tax receipt to <span className="text-ink font-medium">{email}</span>.
          </p>
        )}
        <button
          onClick={onClose}
          className="bg-orange hover:bg-orange-dark text-white font-semibold px-8 py-3 rounded-full transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

      {/* Recurring toggle */}
      <div className="flex rounded-xl overflow-hidden border border-gray-light bg-gray-light/50 p-1 gap-1">
        {[
          { value: false, label: "One-time" },
          { value: true,  label: "Monthly", badge: "Most impactful" },
        ].map(({ value, label, badge }) => (
          <button
            key={String(value)}
            type="button"
            onClick={() => setRecurring(value)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all rounded-lg flex items-center justify-center gap-2 ${
              recurring === value
                ? "bg-white text-orange shadow-sm"
                : "text-gray-warm hover:text-ink"
            }`}
          >
            {label}
            {badge && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                recurring === value ? "bg-orange text-white" : "bg-orange/10 text-orange"
              }`}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 2×2 preset grid */}
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map(({ amount: a, label, desc }) => (
          <button
            key={a}
            type="button"
            onClick={() => { setAmount(a); setUseCustom(false); }}
            className={`py-3 px-3 rounded-xl text-left border transition-all ${
              !useCustom && amount === a
                ? "bg-orange text-white border-orange shadow-md shadow-orange/20"
                : "bg-white text-ink border-gray-light hover:border-orange/40"
            }`}
          >
            <div className="font-bold text-sm leading-none mb-1">{label}</div>
            <div className={`text-[11px] leading-tight ${!useCustom && amount === a ? "text-white/80" : "text-gray-warm"}`}>
              {desc}
            </div>
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div>
        <button
          type="button"
          onClick={() => setUseCustom(!useCustom)}
          className={`text-sm font-semibold transition-colors ${useCustom ? "text-orange" : "text-gray-warm hover:text-ink"}`}
        >
          {useCustom ? "↑ Choose a preset" : "+ Custom amount"}
        </button>
        {useCustom && (
          <div className="relative mt-2">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-warm font-semibold">$</span>
            <input
              type="number"
              min="1"
              step="1"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full pl-8 pr-4 py-3 border border-gray-light rounded-xl text-ink text-sm focus:outline-none focus:border-orange/50"
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Cover the fee */}
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={coverFee}
          onChange={(e) => setCoverFee(e.target.checked)}
          className="w-4 h-4 accent-orange"
        />
        <span className="text-sm text-gray-warm">
          Add <strong className="text-ink">${fmtUsd(feePreview)}</strong> so 100% of my gift reaches Ambition Angels
        </span>
      </label>

      {/* Apple / Google Pay (one-time) */}
      {paymentRequest && !recurring && (
        <div>
          <PaymentRequestButtonElement
            options={{ paymentRequest, style: { paymentRequestButton: { theme: "dark", height: "48px" } } }}
          />
          <div className="flex items-center gap-3 my-1">
            <span className="h-px bg-gray-light flex-1" />
            <span className="text-xs text-gray-mid">or pay with card</span>
            <span className="h-px bg-gray-light flex-1" />
          </div>
        </div>
      )}

      {/* Name + Email */}
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          required
          className="px-4 py-3 border border-gray-light rounded-xl text-ink text-sm focus:outline-none focus:border-orange/50"
        />
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
          className="px-4 py-3 border border-gray-light rounded-xl text-ink text-sm focus:outline-none focus:border-orange/50"
        />
      </div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email address"
        required
        className="px-4 py-3 border border-gray-light rounded-xl text-ink text-sm focus:outline-none focus:border-orange/50"
      />

      {/* Card input */}
      <div className="px-4 py-3.5 border border-gray-light rounded-xl bg-white focus-within:border-orange/50 transition-colors">
        <CardElement options={CARD_STYLE} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !stripe}
        className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white font-bold text-base py-4 rounded-xl transition-colors shadow-lg shadow-orange/20 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Processing…
          </>
        ) : (
          <>
            Donate ${displayAmount}{recurring ? " / mo" : ""}
          </>
        )}
      </button>

      <p className="text-center text-gray-mid text-xs">
        🔒 Secure · Tax-deductible · EIN 87-2513010
      </p>

      {/* Other ways to give */}
      <div className="border-t border-gray-light pt-4">
        <button
          type="button"
          onClick={() => setOtherWaysOpen(!otherWaysOpen)}
          className="w-full flex items-center justify-between text-sm font-semibold text-gray-warm hover:text-ink transition-colors"
        >
          <span>Other ways to give</span>
          <svg
            className={`w-4 h-4 transition-transform ${otherWaysOpen ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {otherWaysOpen && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Check */}
            <div className="bg-gray-light/60 rounded-xl p-4">
              <div className="text-xs font-bold text-ink uppercase tracking-widest mb-2">By Check</div>
              <div className="text-xs text-gray-warm leading-relaxed space-y-0.5">
                <p className="font-semibold text-ink">Ambition Angels Inc.</p>
                <p>380 Portage Ave</p>
                <p>Palo Alto, CA 94306</p>
                <p className="pt-1 text-gray-mid">EIN 87-2513010</p>
              </div>
            </div>
            {/* Wire */}
            <div className="bg-gray-light/60 rounded-xl p-4">
              <div className="text-xs font-bold text-ink uppercase tracking-widest mb-2">Wire Transfer</div>
              <div className="text-xs text-gray-warm leading-relaxed space-y-0.5">
                <p className="font-semibold text-ink">Wells Fargo</p>
                <p>Routing: <span className="font-mono text-ink">121000248</span></p>
                <p>Account: <span className="font-mono text-ink">2245119926</span></p>
                <p className="pt-1 text-gray-mid">EIN 87-2513010</p>
              </div>
            </div>
            {/* Stock */}
            <div className="bg-gray-light/60 rounded-xl p-4">
              <div className="text-xs font-bold text-ink uppercase tracking-widest mb-2">Stock / Securities</div>
              <div className="text-xs text-gray-warm leading-relaxed space-y-0.5">
                <p>Gifts of appreciated stock are tax-smart.</p>
                <p className="pt-1">Email <a href="mailto:remi@ambitionangels.org" className="text-orange font-medium">remi@ambitionangels.org</a> for DTC transfer instructions.</p>
              </div>
            </div>
            {/* DAF */}
            <div className="bg-gray-light/60 rounded-xl p-4">
              <div className="text-xs font-bold text-ink uppercase tracking-widest mb-2">Donor-Advised Fund</div>
              <div className="text-xs text-gray-warm leading-relaxed space-y-0.5">
                <p>Recommend a grant through your DAF.</p>
                <p className="pt-1">Legal name <span className="font-semibold text-ink">Ambition Angels Inc.</span> · EIN <span className="font-mono text-ink">87-2513010</span></p>
              </div>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

// ── Outer modal wrapper ─────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export default function DonateModal({ onClose }: Props) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [stripeKeyMissing, setStripeKeyMissing] = useState(false);

  // Initialize Stripe client-side only, after hydration
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) { setStripeKeyMissing(true); return; }
    setStripePromise(loadStripe(key));
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div className="relative bg-white rounded-card-lg shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-7 pb-0">
          <div>
            <h2 className="font-display font-black text-4xl text-ink tracking-tight leading-none uppercase">
              Give <span className="text-orange">today.</span>
            </h2>
            <p className="text-gray-warm text-sm leading-relaxed mt-2 max-w-xs">
              Every dollar funds a teen&apos;s career internship. 100% free for every student who needs it.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 ml-4 w-8 h-8 rounded-full bg-gray-light hover:bg-gray-mid/30 transition-colors flex items-center justify-center text-gray-warm hover:text-ink"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-7 pt-6">
          {stripeKeyMissing ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
              Stripe is not configured. Add <code className="font-mono text-xs">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> to your environment variables and redeploy.
            </div>
          ) : !stripePromise ? (
            <div className="flex items-center justify-center py-16">
              <svg className="w-6 h-6 animate-spin text-orange" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          ) : (
            <Elements stripe={stripePromise}>
              <DonateForm onClose={onClose} />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}
