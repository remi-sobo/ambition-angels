"use client";

import { useState, useEffect, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

const PRESET_AMOUNTS = [25, 50, 100, 250, 500];

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

// ── Inner form (needs Stripe context) ──────────────────────────────────────

interface FormProps {
  onClose: () => void;
}

function DonateForm({ onClose }: FormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [amount, setAmount] = useState<number>(50);
  const [customAmount, setCustomAmount] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const finalAmount = useCustom
    ? Math.max(1, parseFloat(customAmount) || 0)
    : amount;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!stripe || !elements) return;
      if (finalAmount < 1) {
        setError("Please enter a valid amount.");
        return;
      }
      if (!firstName || !email) {
        setError("First name and email are required.");
        return;
      }

      setLoading(true);
      setError(null);

      const card = elements.getElement(CardElement);
      if (!card) { setLoading(false); return; }

      const fullName = `${firstName} ${lastName}`.trim();

      try {
        if (recurring) {
          // ── Recurring: create PM first, then subscription ──
          const { paymentMethod, error: pmError } = await stripe.createPaymentMethod({
            type: "card",
            card,
            billing_details: { name: fullName, email },
          });

          if (pmError) throw new Error(pmError.message);

          const res = await fetch("/api/create-payment-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: finalAmount,
              name: fullName,
              email,
              recurring: true,
              paymentMethodId: paymentMethod!.id,
            }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to set up subscription");

          if (data.clientSecret) {
            const { error: confirmError, paymentIntent } =
              await stripe.confirmCardPayment(data.clientSecret);
            if (confirmError) throw new Error(confirmError.message);

            // Save + receipt
            await Promise.allSettled([
              fetch("/api/save-donation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: fullName, email, amount: finalAmount,
                  recurring: true,
                  stripePaymentId: paymentIntent?.id ?? data.subscriptionId,
                }),
              }),
              email && fetch("/api/send-receipt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: fullName, email, amount: finalAmount, recurring: true }),
              }),
            ]);
          }

          setSuccess(true);
        } else {
          // ── One-time PaymentIntent ──
          const res = await fetch("/api/create-payment-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: finalAmount, name: fullName, email, recurring: false }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to create payment");

          const { error: confirmError, paymentIntent } =
            await stripe.confirmCardPayment(data.clientSecret, {
              payment_method: {
                card,
                billing_details: { name: fullName, email },
              },
            });

          if (confirmError) throw new Error(confirmError.message);

          // Save + receipt
          await Promise.allSettled([
            fetch("/api/save-donation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: fullName, email, amount: finalAmount,
                recurring: false,
                stripePaymentId: paymentIntent!.id,
              }),
            }),
            email && fetch("/api/send-receipt", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: fullName, email, amount: finalAmount, recurring: false }),
            }),
          ]);

          setSuccess(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [stripe, elements, finalAmount, firstName, lastName, email, recurring]
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
        <p className="text-gray-warm text-base leading-relaxed mb-6 max-w-sm">
          Thank you for investing in the next generation. A receipt has been sent to your email.
        </p>
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
      <div className="flex rounded-xl overflow-hidden border border-gray-light bg-gray-light/50">
        {[false, true].map((isRecurring) => (
          <button
            key={String(isRecurring)}
            type="button"
            onClick={() => setRecurring(isRecurring)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all ${
              recurring === isRecurring
                ? "bg-white text-orange shadow-sm rounded-xl"
                : "text-gray-warm"
            }`}
          >
            {isRecurring ? "Monthly" : "One-time"}
          </button>
        ))}
      </div>

      {/* Preset amounts */}
      <div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {PRESET_AMOUNTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => { setAmount(a); setUseCustom(false); }}
              className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${
                !useCustom && amount === a
                  ? "bg-orange text-white border-orange shadow-md shadow-orange/20"
                  : "bg-white text-ink border-gray-light hover:border-orange/40"
              }`}
            >
              ${a}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setUseCustom(true)}
            className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${
              useCustom
                ? "bg-orange text-white border-orange shadow-md shadow-orange/20"
                : "bg-white text-ink border-gray-light hover:border-orange/40"
            }`}
          >
            Custom
          </button>
        </div>
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
            Donate {finalAmount >= 1 ? `$${useCustom ? (parseFloat(customAmount) || 0).toFixed(0) : amount}` : ""} {recurring ? "/ mo" : ""}
          </>
        )}
      </button>

      <p className="text-center text-gray-mid text-xs">
        🔒 Secure · Tax-deductible · Takes 60 seconds
      </p>
    </form>
  );
}

// ── Outer modal wrapper ─────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export default function DonateModal({ onClose }: Props) {
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
          <Elements stripe={stripePromise}>
            <DonateForm onClose={onClose} />
          </Elements>
        </div>
      </div>
    </div>
  );
}
