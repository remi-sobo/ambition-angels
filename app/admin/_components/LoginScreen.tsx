"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

// BloomOS login. On success we router.refresh() so the server layout and
// the /admin page re-render with the new Supabase session and the Command
// Center replaces this screen.
export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [magicSent, setMagicSent] = useState(false);
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

  return (
    <div
      className="min-h-screen bg-ink flex items-center justify-center px-4"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      <div className="bg-[#1a1d27] border border-white/10 rounded-card-lg p-10 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-3 mb-1">
          <Image
            src="/admin/bloomos-mark.png"
            alt=""
            width={48}
            height={48}
            className="rounded-xl shrink-0"
            priority
          />
          <div className="font-display font-black text-3xl text-cream tracking-tight uppercase leading-none">
            Bloom<span className="text-[#A8B58C]">OS</span>
          </div>
        </div>
        <div className="text-gray-mid text-sm mb-8">Operating System for Ambition Angels</div>
        {magicSent ? (
          <div className="text-cream/80 text-sm leading-relaxed">
            Check your email — we sent a one-time sign-in link to{" "}
            <span className="text-cream font-semibold">{email}</span>.
          </div>
        ) : (
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-cream text-sm placeholder-gray-mid focus:outline-none focus:border-orange/50"
              autoFocus
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-cream text-sm placeholder-gray-mid focus:outline-none focus:border-orange/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-mid hover:text-cream transition-colors"
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
            {loginError && <p className="text-red-400 text-xs">{loginError}</p>}
            <button
              type="submit"
              disabled={loggingIn}
              className="bg-orange hover:bg-orange-dark text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60"
            >
              {loggingIn ? "Signing in…" : "Sign In"}
            </button>
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={loggingIn}
              className="text-gray-mid hover:text-cream text-xs transition-colors disabled:opacity-60"
            >
              Email me a one-time sign-in link instead
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
