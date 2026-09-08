"use client";

import { useState } from "react";
import { C, F } from "../_components/tokens";

/**
 * Magic-link request form.
 *
 * Three things the V2 UX audit called out, fixed here rather than carried
 * over from the prototype:
 *  - Enter submits (it is a real <form>, not an input beside an onClick).
 *  - The button has a pending state; sending hits an email provider and will
 *    exceed 400ms on a real network.
 *  - The confirmation is identical whether or not the address is on the
 *    roster, and it replaces the form in place rather than navigating.
 */
export default function SignInForm({ next, expired }: { next: string; expired: boolean }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/board/signin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && body?.error) {
        setError(body.error);
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong sending the link. Try again, or email shannon@ambitionangels.org.");
    } finally {
      setSending(false);
    }
  }

  const shell: React.CSSProperties = {
    width: "100%",
    maxWidth: 400,
    marginTop: 40,
    background: C.white,
    border: `1px solid ${C.rule}`,
    borderRadius: 12,
    padding: "40px 36px",
  };
  const h1: React.CSSProperties = {
    margin: 0,
    fontFamily: F.heading,
    fontSize: 24,
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: "-0.01em",
    color: C.ink,
  };

  if (sent) {
    return (
      <div style={shell}>
        <h1 style={h1}>Check your email</h1>
        <p style={{ margin: "10px 0 0", fontSize: 17, lineHeight: 1.55, color: C.charcoal }}>
          If that address is on the board roster, a sign-in link is on its way. The link works for 15
          minutes.
        </p>
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.rule}` }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: C.muted }}>
            Wrong address, or nothing arrives? Email shannon@ambitionangels.org and she will check the
            roster.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form style={shell} onSubmit={submit} noValidate>
      <h1 style={h1}>Board portal</h1>
      <p style={{ margin: "10px 0 0", fontSize: 17, lineHeight: 1.55, color: C.muted }}>
        Enter your email and we will send you a sign-in link. No password.
      </p>

      {expired && (
        <p style={{ margin: "16px 0 0", fontSize: 15, lineHeight: 1.5, color: C.orangeDark }}>
          That link has expired or was already used. Request a new one below.
        </p>
      )}

      <div style={{ marginTop: 28 }}>
        <label
          htmlFor="board-email"
          style={{
            display: "block",
            fontFamily: F.heading,
            fontSize: 15,
            fontWeight: 500,
            color: C.ink,
            marginBottom: 8,
          }}
        >
          Email
        </label>
        <input
          id="board-email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.org"
          style={{
            width: "100%",
            height: 52,
            border: `1px solid ${C.ruleStrong}`,
            borderRadius: 6,
            background: C.white,
            padding: "0 16px",
            fontFamily: F.body,
            fontSize: 17,
            color: C.ink,
            outline: "none",
          }}
        />
      </div>

      {error && (
        <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.5, color: C.orangeDark }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={sending}
        style={{
          marginTop: 16,
          width: "100%",
          height: 52,
          border: "none",
          borderRadius: 999,
          background: sending ? C.grayLight : C.orange,
          color: sending ? C.charcoal : C.white,
          fontFamily: F.body,
          fontSize: 17,
          fontWeight: 600,
          cursor: sending ? "default" : "pointer",
        }}
      >
        {sending ? "Sending the link" : "Send me a link"}
      </button>
    </form>
  );
}
