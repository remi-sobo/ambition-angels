"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import TwoStepFrame from "@/app/admin/_components/twoStep/TwoStepFrame";
import CodeField, { isSixDigits } from "@/app/admin/_components/twoStep/CodeField";
import Button from "@/app/admin/_components/ui/Button";
import Alert from "@/app/admin/_components/ui/Alert";
import { SelectField } from "@/app/admin/_components/ui/Field";
import { TYPE } from "@/lib/admin/typeScale";
import { TWO_STEP_ENROLL_PATH } from "@/lib/auth/twoStep";

type Factor = { id: string; friendly_name?: string | null };

export default function VerifyScreen({ next }: { next: string }) {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error: listErr } = await getSupabaseBrowser().auth.mfa.listFactors();
      if (listErr) {
        setLoadError(true);
        return;
      }
      const verified = (data?.totp ?? []).filter((f) => f.status === "verified");
      if (verified.length === 0) {
        // Reset by an owner since this page was opened: set up again.
        window.location.assign(TWO_STEP_ENROLL_PATH);
        return;
      }
      setFactors(verified);
      setFactorId(verified[0].id);
    })().catch(() => setLoadError(true));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !factorId) return;
    if (!isSixDigits(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: verifyErr } = await getSupabaseBrowser().auth.mfa.challengeAndVerify({ factorId, code });
    if (verifyErr) {
      setBusy(false);
      setCode("");
      setError("That code didn't match. Codes change every 30 seconds, so enter the one showing now.");
      return;
    }
    // A full navigation, so middleware sees the new aal2 session cookies.
    window.location.assign(next);
  }

  return (
    <TwoStepFrame
      title="Enter your code"
      intro="Open your authenticator app and enter the 6-digit code for BloomOS."
      footer="Lost your phone? Ask an owner or admin of your organization to reset your two-step login."
    >
      {loadError ? (
        <Alert tone="danger">Your sign-in couldn&apos;t be checked. Reload the page, or sign out and sign in again.</Alert>
      ) : factors === null ? (
        <p className={TYPE.bodyMuted}>Checking your sign-in…</p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {factors.length > 1 ? (
            <SelectField
              label="Authenticator"
              value={factorId}
              onChange={(e) => setFactorId(e.target.value)}
              options={factors.map((f, i) => ({ value: f.id, label: f.friendly_name || `Authenticator ${i + 1}` }))}
            />
          ) : null}
          <CodeField value={code} onChange={setCode} error={error} autoFocus />
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!isSixDigits(code)}>
            {busy ? "Checking" : "Continue"}
          </Button>
        </form>
      )}
    </TwoStepFrame>
  );
}
