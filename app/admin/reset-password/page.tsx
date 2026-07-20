"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { TYPE } from "@/lib/admin/typeScale";

// Set a NEW password after arriving from a recovery email. /auth/callback has
// already exchanged the link for a session, so here we just collect the new
// password and call updateUser() — no current password required. That's the
// whole point: it's the flow the Settings change-password form can't be (it
// verifies the current password). If there's no session (link expired, or the
// page was opened cold in a different browser), we say so and point to login.

const inputCls =
  "w-full bg-tile border-[1.5px] border-outline rounded-xl px-4 py-3 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/50";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"loading" | "ok" | "no-session">("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getSupabaseBrowser().auth.getUser();
      if (cancelled) return;
      if (data.user) {
        setEmail(data.user.email ?? null);
        setReady("ok");
      } else {
        setReady("no-session");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { error: updErr } = await getSupabaseBrowser().auth.updateUser({ password: next });
      if (updErr) {
        setError(updErr.message || "Couldn't set the password — request a fresh link and try again.");
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 lg:px-8 py-10 max-w-sm">
      <h1 className={`${TYPE.pageTitle} tracking-tight mb-1`}>Set a new password</h1>

      {ready === "loading" && <p className={`${TYPE.bodyMuted} mt-3`}>Checking your reset link…</p>}

      {ready === "no-session" && (
        <div className="mt-3 space-y-4">
          <p className={TYPE.bodyMuted}>
            This reset link is invalid or has expired. Open the most recent link from your email, or
            request a new one from the sign-in screen.
          </p>
          <Link
            href="/admin"
            className="inline-block text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-5 py-2.5 rounded-full transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      )}

      {ready === "ok" && done && (
        <div className="mt-3 space-y-4">
          <div className="text-sm text-revenue bg-revenue-bg border border-revenue/20 rounded-lg px-4 py-3">
            Password set{email ? ` for ${email}` : ""}. You can use it to sign in from now on.
          </div>
          <button
            type="button"
            onClick={() => {
              router.push("/admin");
              router.refresh();
            }}
            className="inline-block text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-5 py-2.5 rounded-full transition-colors"
          >
            Go to BloomOS
          </button>
        </div>
      )}

      {ready === "ok" && !done && (
        <>
          <p className={`${TYPE.bodyMuted} mt-1 mb-6`}>
            {email ? (
              <>
                Choose a new password for <span className="font-semibold text-ink-1">{email}</span>. No
                current password needed.
              </>
            ) : (
              "Choose a new password. No current password needed."
            )}
          </p>
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs text-ink-2">
              New password
              <input
                type={show ? "text" : "password"}
                className={`${inputCls} mt-1`}
                value={next}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                onChange={(e) => setNext(e.target.value)}
                autoFocus
                required
              />
            </label>
            <label className="block text-xs text-ink-2">
              Confirm new password
              <input
                type={show ? "text" : "password"}
                className={`${inputCls} mt-1`}
                value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-ink-2 select-none">
              <input
                type="checkbox"
                checked={show}
                onChange={(e) => setShow(e.target.checked)}
                className="accent-orange"
              />
              Show password
            </label>
            {error && <p className="text-xs text-expense">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-5 py-2.5 rounded-full transition-colors disabled:opacity-50"
            >
              {busy ? "Setting…" : "Set password"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
