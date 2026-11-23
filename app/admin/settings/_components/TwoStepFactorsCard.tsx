"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import Button from "@/app/admin/_components/ui/Button";
import Alert from "@/app/admin/_components/ui/Alert";
import { TextField } from "@/app/admin/_components/ui/Field";
import TwoStepEnroll from "@/app/admin/_components/twoStep/TwoStepEnroll";
import { TYPE } from "@/lib/admin/typeScale";

// Settings → Your account → Two-step login: the signed-in person's
// authenticators. List and add go straight to Supabase Auth from the browser
// (the session is already aal2); remove goes through
// /api/admin/account/two-step/factors/[id], which refuses the last one.

type Factor = { id: string; friendly_name?: string | null; created_at: string };

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function TwoStepFactorsCard() {
  const save = useSaveAction();
  const confirm = useConfirm();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState<"no" | "naming" | "enrolling">("no");
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getSupabaseBrowser().auth.mfa.listFactors();
    if (error) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setFactors((data?.totp ?? []).filter((f) => f.status === "verified"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(f: Factor, label: string) {
    const ok = await confirm({
      title: `Remove ${label}?`,
      body: "Codes from this authenticator stop working for BloomOS right away.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(f.id);
    await save({
      request: { url: `/api/admin/account/two-step/factors/${f.id}`, method: "DELETE" },
      success: `${label} removed`,
    });
    setBusyId(null);
    await load();
  }

  if (loadError) return <Alert tone="danger">Your authenticators couldn&apos;t be loaded. Reload the page to try again.</Alert>;
  if (factors === null) return <p className={TYPE.bodyMuted}>Loading…</p>;

  const onlyOne = factors.length <= 1;
  const taken = new Set(factors.map((f) => (f.friendly_name ?? "").toLowerCase()));
  const trimmed = name.trim();
  const nameError = trimmed && taken.has(trimmed.toLowerCase()) ? "You already have an authenticator with that name." : null;

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-outline border border-hairline rounded-panel">
        {factors.map((f, i) => {
          const label = f.friendly_name || `Authenticator ${i + 1}`;
          return (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink-1">{label}</span>
                <span className={`block ${TYPE.metadata}`}>Added {fmtDate(f.created_at)}</span>
              </span>
              <Button
                variant="quiet"
                size="sm"
                onClick={() => void remove(f, label)}
                disabled={onlyOne}
                loading={busyId === f.id}
                aria-label={`Remove ${label}`}
                title={onlyOne ? "Your only authenticator. Add another before removing this one." : undefined}
              >
                Remove
              </Button>
            </li>
          );
        })}
      </ul>
      {onlyOne ? (
        <p className={TYPE.metadata}>
          This is your only authenticator, so it can&apos;t be removed. Add a second one (a backup phone, or a password
          manager) so losing a phone never locks you out.
        </p>
      ) : null}

      {adding === "no" ? (
        <Button variant="secondary" onClick={() => setAdding("naming")}>
          Add another authenticator
        </Button>
      ) : adding === "naming" ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed && !nameError) setAdding("enrolling");
          }}
        >
          <TextField
            label="Name it"
            hint="So you can tell them apart, e.g. Backup phone."
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            error={nameError ?? undefined}
            controlSize="md"
            className="min-w-[14rem]"
            autoFocus
          />
          <Button type="submit" disabled={!trimmed || !!nameError}>
            Continue
          </Button>
          <Button variant="quiet" onClick={() => setAdding("no")}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="border border-hairline rounded-panel p-4 space-y-3">
          <TwoStepEnroll
            friendlyName={trimmed}
            submitLabel="Add authenticator"
            onDone={() => {
              setAdding("no");
              setName("");
              void load();
            }}
          />
          <Button variant="quiet" size="sm" onClick={() => setAdding("no")}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
