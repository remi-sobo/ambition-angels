import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DEMO_COOKIE, cookieIsValid } from "@/lib/demo/auth";
import DemoGateForm from "./DemoGateForm";

/**
 * /demo — the My Ambition partner demo behind one shared password.
 *
 * Signed out: a password screen (a door, not a landing page — no logo
 * lockup, no marketing copy, no "forgot password"). Signed in: the demo
 * bundle in a full-viewport iframe pointed at /demo/app, which does its own
 * cookie check, plus a small fixed "Sign out" link. The iframe keeps the
 * demo's own scroll and layout intact and keeps the URL at /demo wherever
 * the visitor is inside the app.
 *
 * Standalone chrome (no public Nav/Footer — see components/SiteChrome.tsx),
 * noindex here and in robots.ts, and absent from the sitemap.
 */

export const metadata: Metadata = {
  title: "My Ambition · Private demo",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

const DOT_TEXTURE = {
  backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

export default function DemoPage({ searchParams }: { searchParams?: { error?: string } }) {
  const authed = cookieIsValid(cookies().get(DEMO_COOKIE)?.value);

  if (authed) {
    return (
      <div className="fixed inset-0 bg-[#F5F7FA]">
        <iframe
          src="/demo/app"
          title="My Ambition demo"
          className="block h-full w-full border-0"
        />
        <a
          href="/demo/logout"
          className="fixed bottom-3 right-3 rounded-full border border-ink/10 bg-white/90 px-3.5 py-1.5 font-heading text-xs font-semibold text-charcoal shadow-sm backdrop-blur transition hover:text-ink"
        >
          Sign out
        </a>
      </div>
    );
  }

  const error = searchParams?.error === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-5 py-12" style={DOT_TEXTURE}>
      <div className="w-full max-w-[400px]">
        <p className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-orange">
          Ambition Angels · Private demo
        </p>
        <h1 className="mt-4 font-display text-[66px] font-extrabold leading-[0.92] text-white">
          My
          <br />
          Ambition
        </h1>
        <div className="mb-[18px] mt-5 h-1 w-14 bg-orange" aria-hidden="true" />
        <p className="max-w-[34ch] font-body text-base leading-[1.6] text-white/[0.78]">
          This build is not public yet. Enter the password you were sent.
        </p>
        <div className="mt-8">
          <DemoGateForm error={error} />
        </div>
        <p className="mt-7 font-heading text-[11px] uppercase tracking-[0.05em] text-white/[0.38]">
          Sample data shown for illustration
        </p>
      </div>
    </div>
  );
}
