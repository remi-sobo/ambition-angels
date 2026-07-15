"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarConnectionStatus } from "@/lib/google/connection";

const inputCls =
  "w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

export function DisplayNameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const dirty = name.trim() !== initialName.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    const trimmed = name.trim();
    if (!trimmed) { setError("Enter a name."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: trimmed }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? `HTTP ${res.status}`); return; }
      setDone(true);
      // Refresh server components so the greeting picks up the new name.
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 max-w-sm">
      <label className="block text-xs text-ink-2">
        Display name
        <input
          type="text"
          className={`${inputCls} mt-1`}
          value={name}
          maxLength={80}
          autoComplete="name"
          placeholder="How BloomOS should address you"
          onChange={(e) => { setName(e.target.value); setDone(false); }}
          required
        />
      </label>
      {error && <p className="text-xs text-expense">{error}</p>}
      {done && !error && <p className="text-xs text-revenue">Saved.</p>}
      <button
        type="submit"
        disabled={busy || !dirty}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-5 py-2.5 rounded-full transition-colors disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save name"}
      </button>
    </form>
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

type CalendarChoice = {
  id: string;
  label: string;
  primary: boolean;
  accessRole: string;
  alreadyConnected: boolean;
};

/** Post-OAuth calendar picker: choose which of the account's calendars to connect. */
function CalendarPicker({ onDone }: { onDone: (connected: boolean) => void }) {
  const [accountEmail, setAccountEmail] = useState<string>("");
  const [choices, setChoices] = useState<CalendarChoice[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | "load" | "save" | "cancel">("load");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/agenda/connect-google/calendars");
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(j.error ?? `HTTP ${res.status}`);
          return;
        }
        const cals = (j.calendars ?? []) as CalendarChoice[];
        setAccountEmail(j.accountEmail ?? "");
        setChoices(cals);
        // Pre-select the account's own calendar plus anything already connected.
        setSelected(new Set(cals.filter((c) => c.primary || c.alreadyConnected).map((c) => c.id)));
      } catch {
        if (!cancelled) setError("Couldn't load this account's calendars — try again.");
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setError(null);
    setBusy("save");
    try {
      const res = await fetch("/api/admin/agenda/connect-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarIds: Array.from(selected) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      // Pull the new calendars into the cache right away (best-effort).
      await fetch("/api/admin/agenda/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).catch(() => {});
      onDone(true);
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    try {
      await fetch("/api/admin/agenda/connect-google", { method: "DELETE" }).catch(() => {});
    } finally {
      setBusy(null);
      onDone(false);
    }
  };

  return (
    <div className="space-y-3 bg-tile border-[1.5px] border-outline rounded-lg p-4">
      <p className="text-sm text-ink-1 font-medium">
        Choose calendars to connect
        {accountEmail ? <span className="text-ink-2 font-normal"> · {accountEmail}</span> : null}
      </p>
      {busy === "load" && <p className="text-xs text-ink-2">Loading calendars…</p>}
      {choices && choices.length === 0 && (
        <p className="text-xs text-ink-2">This account has no calendars BloomOS can read.</p>
      )}
      {choices && choices.length > 0 && (
        <ul className="space-y-2">
          {choices.map((c) => (
            <li key={c.id}>
              <label className="flex items-start gap-2 text-sm text-ink-1 select-none">
                <input
                  type="checkbox"
                  className="accent-orange mt-0.5"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <span>
                  {c.label}
                  {c.primary && <span className="text-ink-2 text-xs"> · primary</span>}
                  {c.alreadyConnected && <span className="text-revenue text-xs"> · already connected</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-expense">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={busy !== null || selected.size === 0}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-5 py-2.5 rounded-full transition-colors disabled:opacity-50"
        >
          {busy === "save" ? "Connecting…" : `Connect ${selected.size || ""} calendar${selected.size === 1 ? "" : "s"}`}
        </button>
        <button
          onClick={cancel}
          disabled={busy !== null}
          className="text-xs font-semibold text-ink-1 bg-tile border-[1.5px] border-outline hover:border-orange/40 px-5 py-2.5 rounded-full transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ConnectCalendarControls({
  status,
  oauthResult,
  oauthReason,
}: {
  status: CalendarConnectionStatus;
  /** `calendar` query param set by the OAuth callback: pick | cancelled | error. */
  oauthResult?: string;
  oauthReason?: string;
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(oauthResult === "pick");
  const [busy, setBusy] = useState<null | "sync">(null);
  const [error, setError] = useState<string | null>(
    oauthResult === "error" ? (oauthReason || "The Google connection failed — try again.") : null
  );
  const [msg, setMsg] = useState<string | null>(
    oauthResult === "cancelled" ? "Connection cancelled — no account was connected." : null
  );

  const startConnect = () => {
    // Full-page navigation into the OAuth flow: Google shows its own account
    // chooser, so the user picks which account to connect.
    window.location.assign("/api/admin/agenda/connect-google/start");
  };

  const finishPicker = (connected: boolean) => {
    setPicking(false);
    setMsg(connected ? "Calendar connected." : null);
    router.replace("/admin/settings");
    router.refresh();
  };

  const sync = async () => {
    setError(null);
    setMsg(null);
    setBusy("sync");
    try {
      const res = await fetch("/api/admin/agenda/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setMsg("Calendar refreshed.");
      router.refresh();
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-ink-2">Status</dt>
        <dd className="text-ink-1">
          {status.connected ? (
            <span className="text-revenue font-medium">Connected</span>
          ) : (
            <span className="text-ink-2">Not connected yet</span>
          )}
        </dd>
        {status.calendars.length > 0 && (
          <>
            <dt className="text-ink-2">Calendars</dt>
            <dd className="text-ink-1">
              <ul className="space-y-0.5">
                {status.calendars.map((c) => (
                  <li key={c.calendarId}>
                    {c.label}
                    {c.accountEmail && c.accountEmail !== c.calendarId ? (
                      <span className="text-ink-2"> · {c.accountEmail}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {status.connected && (
          <>
            <dt className="text-ink-2">Last synced</dt>
            <dd className="text-ink-1">
              {relativeTime(status.lastSyncedAt)}
              <span className="text-ink-2"> · {status.eventCount} event{status.eventCount === 1 ? "" : "s"} cached</span>
            </dd>
          </>
        )}
      </dl>

      {picking ? (
        <CalendarPicker onDone={finishPicker} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={startConnect}
            disabled={busy !== null}
            className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-5 py-2.5 rounded-full transition-colors disabled:opacity-50"
          >
            {status.connected ? "Connect another account" : "Connect Google Calendar"}
          </button>
          <button
            onClick={sync}
            disabled={busy !== null || !status.connected}
            className="text-xs font-semibold text-ink-1 bg-tile border-[1.5px] border-outline hover:border-orange/40 px-5 py-2.5 rounded-full transition-colors disabled:opacity-50"
          >
            {busy === "sync" ? "Refreshing…" : "Refresh calendar now"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-expense">{error}</p>}
      {msg && !error && <p className="text-xs text-revenue">{msg}</p>}
    </div>
  );
}

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
