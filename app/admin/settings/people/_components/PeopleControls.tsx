"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import Button from "@/app/admin/_components/ui/Button";
import { Select } from "@/app/admin/_components/ui/Input";
import { SelectField, TextField } from "@/app/admin/_components/ui/Field";

// Settings → People and roles: the invite form and the per-row role and
// remove controls. Every write goes through saveAction with no optimistic
// change: the screen re-reads from the server after a success, and a
// refusal (last owner, not allowed) toasts the server's sentence.

type RoleOption = { value: string; label: string };

export function InviteForm({ roles }: { roles: RoleOption[] }) {
  const router = useRouter();
  const save = useSaveAction();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const r = await save<{ emailed?: boolean }>({
      request: { url: "/api/admin/settings/people", method: "POST", body: { email, role } },
      success: (d) => (d.emailed ? `Invite sent to ${email.trim()}` : `${email.trim()} added. They can sign in with their account.`),
      failure: false,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setEmail("");
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      aria-labelledby="invite-h"
      className="rounded-panel border border-hairline bg-surface px-5 py-4"
    >
      <h2 id="invite-h" className="text-sm font-semibold text-ink-1">
        Invite someone
      </h2>
      <p className="text-sm text-ink-2 mt-0.5">
        They get an email to set a password. Someone who already has a BloomOS account is added straight away.
      </p>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="off"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.org"
          error={error ?? undefined}
          controlSize="md"
        />
        <SelectField label="Role" name="role" value={role} onChange={(e) => setRole(e.target.value)} options={roles} controlSize="md" />
        <Button type="submit" loading={busy} disabled={!email.trim()}>
          {busy ? "Sending" : "Send invite"}
        </Button>
      </div>
    </form>
  );
}

export function MemberActions({
  userId,
  name,
  role,
  roleChoices,
  canChangeRole,
  canRemove,
  canResetTwoStep = false,
  lockedReason,
}: {
  userId: string;
  name: string;
  role: string;
  roleChoices: RoleOption[];
  canChangeRole: boolean;
  canRemove: boolean;
  /** Owner/admin may reset this person's two-step login (they have one). */
  canResetTwoStep?: boolean;
  lockedReason: string | null;
}) {
  const router = useRouter();
  const save = useSaveAction();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const label = roleChoices.find((r) => r.value === role)?.label ?? role;

  async function change(next: string) {
    if (next === role || busy) return;
    setBusy(true);
    await save({
      request: { url: `/api/admin/settings/people/${userId}`, method: "PATCH", body: { role: next } },
      success: `${name} is now ${roleChoices.find((x) => x.value === next)?.label ?? next}`,
    });
    setBusy(false);
    // Success or refusal, re-read: the select shows what the server holds.
    router.refresh();
  }

  async function remove() {
    if (busy) return;
    const ok = await confirm({
      title: `Remove ${name}?`,
      body: "They lose access to this organization right away. Their account and anything they made here stay.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const r = await save({
      request: { url: `/api/admin/settings/people/${userId}`, method: "DELETE" },
      success: `${name} removed`,
    });
    setBusy(false);
    if (r.ok) router.refresh();
  }

  async function resetTwoStep() {
    if (busy) return;
    const ok = await confirm({
      title: `Reset two-step login for ${name}?`,
      body: "Their authenticator stops working right away, and BloomOS asks them to set up a new one the next time they open it. Use this when they have lost their phone.",
      confirmLabel: "Reset two-step login",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const r = await save({
      request: { url: `/api/admin/settings/people/${userId}/two-step`, method: "DELETE" },
      success: `Two-step login reset for ${name}. They set it up again at their next sign-in.`,
    });
    setBusy(false);
    if (r.ok) router.refresh();
  }

  const resetButton = canResetTwoStep ? (
    <Button variant="quiet" size="md" onClick={() => void resetTwoStep()} disabled={busy} aria-label={`Reset two-step login for ${name}`}>
      Reset two-step login
    </Button>
  ) : null;

  if (!canChangeRole && !canRemove) {
    return (
      <span className="block">
        <span className="text-sm font-semibold text-ink-1">{label}</span>
        {lockedReason ? <span className="block text-xs text-ink-3">{lockedReason}</span> : null}
        {resetButton ? <span className="block mt-1">{resetButton}</span> : null}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {canChangeRole ? (
        <Select
          aria-label={`Role for ${name}`}
          value={role}
          disabled={busy}
          onChange={(e) => void change(e.target.value)}
          controlSize="md"
          className="!w-auto min-w-[150px]"
        >
          {roleChoices.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      ) : (
        <span className="text-sm font-semibold text-ink-1">{label}</span>
      )}
      {canRemove ? (
        <Button variant="quiet" size="md" onClick={() => void remove()} disabled={busy} aria-label={`Remove ${name}`}>
          Remove
        </Button>
      ) : null}
      {resetButton}
    </span>
  );
}
