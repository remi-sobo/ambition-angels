"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setError("New passwords don't match."); return; }
    if (next === current) { setError("New password must be different from the current one."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? `HTTP ${res.status}`); return; }
      setDone(true);
      setCurrent(""); setNext(""); setConfirm("");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="text-sm text-revenue bg-revenue-bg border border-revenue/20 rounded-lg px-4 py-3">
        Password updated. Your current session stays signed in; other devices will need the new password.{" "}
        <button onClick={() => setDone(false)} className="font-semibold underline hover:no-underline">Change again</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-sm">
      <label className="block text-xs text-ink-2">
        Current password
        <input
          type={show ? "text" : "password"}
          className={`${inputCls} mt-1`}
          value={current}
          autoComplete="current-password"
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </label>
      <label className="block text-xs text-ink-2">
        New password
        <input
          type={show ? "text" : "password"}
          className={`${inputCls} mt-1`}
          value={next}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          onChange={(e) => setNext(e.target.value)}
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
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-orange" />
        Show passwords
      </label>
      {error && <p className="text-xs text-expense">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-5 py-2.5 rounded-full transition-colors disabled:opacity-50"
      >
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

export function SignOutAllButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!confirm("Sign out of every device, including this one?")) return;
    setBusy(true);
    try {
      await fetch("/api/admin/account/signout-all", { method: "POST" });
      router.push("/admin");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={run}
      disabled={busy}
      className="text-xs font-semibold text-expense bg-expense-bg hover:opacity-90 border border-expense/20 px-4 py-2 rounded-full transition-opacity disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out of all devices"}
    </button>
  );
}
