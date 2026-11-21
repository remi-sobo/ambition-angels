"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import Button from "@/app/admin/_components/ui/Button";
import Alert from "@/app/admin/_components/ui/Alert";
import { TYPE } from "@/lib/admin/typeScale";
import CodeField, { isSixDigits } from "./CodeField";

/**
 * Set up an authenticator app (Supabase Auth MFA, TOTP). Used by the
 * first-time enroll screen (/admin/two-step/enroll) and by Settings → Your
 * account → "Add another authenticator". Talks to Supabase Auth directly from
 * the browser: enroll returns the QR code and the secret, then a 6-digit code
 * from the app verifies the factor and lifts the session to aal2.
 *
 * Abandoned attempts leave an unverified factor behind; those are removed
 * first, so starting over never collides with a half-finished one.
 */
/** supabase-js hands back the QR as `data:image/svg+xml;utf-8,<svg …>` with
 *  the SVG unencoded, so a `#` in it (a colour) ends the URL as a fragment
 *  and the image breaks. Re-encode the SVG part. */
function qrSrc(raw: string): string {
  const m = raw.match(/^data:image\/svg\+xml;(?:utf-8|charset=utf-8),([\s\S]*)$/);
  if (!m) return raw;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(m[1])}`;
}

export default function TwoStepEnroll({
  friendlyName,
  onDone,
  submitLabel = "Turn on two-step login",
}: {
  friendlyName: string;
  onDone: () => void;
  submitLabel?: string;
}) {
  const started = useRef(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Strict mode runs effects twice in development; one enroll per mount.
    if (started.current) return;
    started.current = true;
    (async () => {
      const sb = getSupabaseBrowser();
      const { data: list } = await sb.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.status === "unverified" && f.factor_type === "totp") {
          await sb.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error: enrollErr } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName });
      if (enrollErr || !data || data.type !== "totp") {
        setError(
          enrollErr?.message?.toLowerCase().includes("friendly name")
            ? "You already have an authenticator with that name. Pick another name."
            : "Two-step setup didn't start. Reload the page to try again.",
        );
        setPhase("error");
        return;
      }
      setFactorId(data.id);
      setQr(qrSrc(data.totp.qr_code));
      setSecret(data.totp.secret);
      setPhase("ready");
    })().catch(() => {
      setError("Two-step setup didn't start. Reload the page to try again.");
      setPhase("error");
    });
  }, [friendlyName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || busy) return;
    if (!isSixDigits(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: verifyErr } = await getSupabaseBrowser().auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (verifyErr) {
      setError("That code didn't match. Codes change every 30 seconds, so enter the one showing now.");
      setCode("");
      return;
    }
    onDone();
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (phase === "loading") return <p className={TYPE.bodyMuted}>Preparing your setup code…</p>;
  if (phase === "error") return <Alert tone="danger">{error}</Alert>;

  return (
    <form onSubmit={submit} className="space-y-5">
      <ol className="space-y-5">
        <li>
          <p className={TYPE.body}>
            <span className="font-semibold">1. Scan this code</span> with an authenticator app, such as Google
            Authenticator, Microsoft Authenticator, 1Password or Authy.
          </p>
          {qr ? (
            <div className="mt-3 inline-block rounded-panel bg-white p-3 border border-hairline">
              {/* A data: URI SVG from Supabase; next/image adds nothing here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR code for your authenticator app" width={176} height={176} />
            </div>
          ) : null}
        </li>
        <li>
          <p className={TYPE.body}>
            <span className="font-semibold">Can&apos;t scan?</span> Type this key into the app instead.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code
              aria-label="Setup key"
              className="font-mono text-sm tracking-wider text-ink-1 bg-tile border border-hairline rounded-control px-3 py-2 break-all"
            >
              {secret.match(/.{1,4}/g)?.join(" ")}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void copySecret()}>
              {copied ? "Copied" : "Copy key"}
            </Button>
          </div>
        </li>
        <li>
          <p className={`${TYPE.body} mb-2`}>
            <span className="font-semibold">2. Enter the 6-digit code</span> the app shows.
          </p>
          <CodeField value={code} onChange={setCode} error={error} />
        </li>
      </ol>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!isSixDigits(code)}>
        {busy ? "Checking" : submitLabel}
      </Button>
    </form>
  );
}
