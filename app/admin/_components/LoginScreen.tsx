"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { TYPE } from "@/lib/admin/typeScale";

// BloomOS sign-in, split-screen: brand panel on the left (the "are we
// winning" pitch from bloomos.org, synthetic numbers only), the form on the
// right. Renders as a fixed overlay so the pre-auth view never exposes the
// sidebar IA — a shared host shows no tenant identity before auth, which is
// also why every string here is generic BloomOS, never an org name.
//
// On success we router.refresh() so the server layout and the /admin page
// re-render with the new Supabase session and the Command Center replaces
// this screen.
//
// `sessionEmail` is set when a valid session exists but holds no org
// membership (e.g. a Google account outside the allowlist) — without the
// explicit dead-end message that state would silently loop back to the form.
export default function LoginScreen({
  sessionEmail = null,
  authError = false,
}: {
  sessionEmail?: string | null;
  authError?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(
    authError ? "That sign-in link is invalid or expired. Try again." : ""
  );
  const [magicSent, setMagicSent] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        setLoginError("Invalid email or password.");
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setLoginError("Enter your email first.");
      return;
    }
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, magic: true }),
      });
      if (res.ok) setMagicSent(true);
      else setLoginError("Could not send the sign-in link.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setLoginError("Enter your email first, then request a reset link.");
      return;
    }
    setLoggingIn(true);
    setLoginError("");
    setResetMsg("");
    try {
      const res = await fetch("/api/admin/account/password/reset-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setResetMsg(`If an account exists for ${email}, a password reset link is on its way.`);
      } else {
        setLoginError("Could not send the reset link. Try again.");
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const handleGoogle = async () => {
    setLoggingIn(true);
    setLoginError("");
    const { error } = await getSupabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/admin`,
      },
    });
    // On success the browser navigates to Google; we only land here on error.
    if (error) {
      setLoginError("Could not start Google sign-in. Try again.");
      setLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    setLoggingIn(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      router.refresh();
    } finally {
      setLoggingIn(false);
    }
  };

  const wordmark = (
    <div className="flex items-center gap-2.5">
      {/* Plain <img> (not next/image): more reliable behind the admin
          PWA's cache-first service worker than the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/admin/bloomos-mark.png"
        alt=""
        width={36}
        height={36}
        className="rounded-xl shrink-0"
      />
      <span className="font-display font-black text-3xl tracking-tight normal-case leading-none">
        Bloom<span className="text-[#A8B58C]">OS</span>
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 lg:grid lg:grid-cols-2">
      {/* Brand panel — the BloomOS illustration (tulip mark over the valley),
          words at the bottom over a soft scrim so they never fight the mark. */}
      <div className="hidden lg:block relative bg-navy overflow-hidden">
        {/* Plain <img> (not next/image): more reliable behind the admin
            PWA's cache-first service worker than the image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/admin/login-art.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-x-0 bottom-0 pt-40 pb-12 px-12 xl:px-16"
          style={{
            background:
              "linear-gradient(to top, rgba(23,20,15,0.82) 0%, rgba(23,20,15,0.55) 55%, transparent 100%)",
          }}
        >
          <h1 className="font-heading font-bold text-cream text-4xl xl:text-5xl tracking-tight leading-[1.08] max-w-md">
            Everything your mission runs on.
          </h1>
          <p className="text-cream/85 text-sm leading-relaxed mt-4">
            One system. All your work. Stronger impact.
          </p>
          <div className="text-cream/50 text-xs mt-8">
            BloomOS is a SOBO Consulting product.
          </div>
        </div>
      </div>

      {/* Form panel — cream workspace, same surface language as the app. */}
      <div className="h-full overflow-y-auto bg-ink flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="text-ink-1 mb-10">{wordmark}</div>

          {sessionEmail ? (
            <div>
              <h2 className={`${TYPE.pageTitle} tracking-tight`}>
                No workspace yet
              </h2>
              <p className={`${TYPE.bodyMuted} leading-relaxed mt-3`}>
                You&apos;re signed in as{" "}
                <span className="font-semibold text-ink-1">{sessionEmail}</span>,
                but that account doesn&apos;t belong to an organization on
                BloomOS. Ask your organization&apos;s admin for an invite, or
                sign out and use a different account.
              </p>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={loggingIn}
                className="mt-6 w-full bg-surface hover:bg-tile border-[1.5px] border-outline text-ink-1 font-semibold py-3 rounded-xl transition-colors disabled:opacity-60"
              >
                Sign out
              </button>
            </div>
          ) : magicSent ? (
            <div>
              <h2 className={`${TYPE.pageTitle} tracking-tight`}>
                Check your email
              </h2>
              <p className={`${TYPE.bodyMuted} leading-relaxed mt-3`}>
                We sent a one-time sign-in link to{" "}
                <span className="font-semibold text-ink-1">{email}</span>.
              </p>
              <button
                type="button"
                onClick={() => setMagicSent(false)}
                className="mt-6 text-ink-2 hover:text-ink-1 text-xs transition-colors"
              >
                Use a different email or password instead
              </button>
            </div>
          ) : (
            <>
              <h2 className={`${TYPE.pageTitle} tracking-tight`}>
                Welcome back
              </h2>
              <p className={`${TYPE.bodyMuted} mt-1 mb-7`}>
                Sign in to your organization&apos;s BloomOS.
              </p>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={loggingIn}
                className="w-full flex items-center justify-center gap-2.5 bg-surface hover:bg-tile border-[1.5px] border-outline text-ink-1 font-semibold text-sm py-3 rounded-xl transition-colors disabled:opacity-60"
              >
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                Sign in with Google
              </button>

              <div className="flex items-center gap-3 my-6">
                <div className="h-px flex-1 bg-hairline" />
                <span className="text-ink-3 text-xs">or</span>
                <div className="h-px flex-1 bg-hairline" />
              </div>

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  className={`bg-tile border-[1.5px] border-outline rounded-xl px-4 py-3 ${TYPE.body} placeholder-ink-3 focus:outline-none focus:border-orange/50`}
                  autoFocus
                />
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    autoComplete="current-password"
                    className={`w-full bg-tile border-[1.5px] border-outline rounded-xl px-4 py-3 pr-12 ${TYPE.body} placeholder-ink-3 focus:outline-none focus:border-orange/50`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-2 hover:text-ink-1 transition-colors"
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12z" />
                        <circle cx="12" cy="12" r="2.8" />
                        <path d="M4 4l16 16" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12z" />
                        <circle cx="12" cy="12" r="2.8" />
                      </svg>
                    )}
                  </button>
                </div>
                {loginError && <p className="text-expense text-xs">{loginError}</p>}
                {resetMsg && <p className="text-revenue text-xs">{resetMsg}</p>}
                <button
                  type="submit"
                  disabled={loggingIn}
                  className="bg-orange hover:bg-orange-dark text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60"
                >
                  {loggingIn ? "Signing in…" : "Sign in"}
                </button>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleMagicLink}
                    disabled={loggingIn}
                    className="text-ink-2 hover:text-ink-1 text-xs transition-colors disabled:opacity-60"
                  >
                    Email me a one-time sign-in link instead
                  </button>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loggingIn}
                    className="text-ink-2 hover:text-ink-1 text-xs transition-colors disabled:opacity-60 shrink-0"
                  >
                    Forgot password?
                  </button>
                </div>
              </form>
            </>
          )}

          <p className="text-ink-2 text-xs mt-10 pt-5 border-t border-hairline">
            New to BloomOS?{" "}
            <a
              href="https://bloomos.org"
              className="font-semibold text-orange-dark hover:text-orange transition-colors"
            >
              Book a walkthrough
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
