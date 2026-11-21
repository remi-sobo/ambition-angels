"use client";

// Scheduler Google account: the Google account the public /meet scheduler
// books on and sends confirmations from. Connecting goes through Google's own
// account chooser and replaces the hand-copied GOOGLE_REFRESH_TOKEN env var
// (still used as a fallback). Org admins only; the routes enforce it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";
import type { SchedulerConnectionStatus } from "@/lib/google/scheduler-connection";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export type SchedulerNotice = { kind: "connected" | "cancelled" | "error"; reason?: string } | null;

export function SchedulerGoogleCard({
  status,
  notice,
}: {
  status: SchedulerConnectionStatus;
  notice: SchedulerNotice;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const disconnect = async () => {
    if (status.state === "none") return;
    const ok = await confirm({
      title: "Disconnect the scheduler account?",
      body: `New /meet bookings stop going onto ${status.accountEmail}'s calendar and confirmation emails stop sending from it, unless the server has an older backup token. Events already booked stay on the calendar.`,
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/scheduler/connect-google", { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(userMessage(res, j));
      router.replace("/admin/settings/connections");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : networkMessage());
    } finally {
      setBusy(false);
    }
  };

  const connectLabel = status.state === "none" ? "Connect" : "Reconnect";

  return (
    <section className="rounded-panel border border-hairline bg-surface px-5 py-4 space-y-3" aria-label="Scheduler Google account">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink-1">Scheduler Google account</h2>
          <p className="text-sm text-ink-2 mt-0.5">
            The account your public meeting page (/meet) books on. Bookings go on its calendar and
            confirmation, reschedule, cancel and reminder emails come from it.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {status.state !== "none" && (
            <button
              onClick={disconnect}
              disabled={busy}
              className="text-sm font-semibold text-ink-2 hover:text-ink-1 transition-colors disabled:opacity-50"
            >
              {busy ? "Disconnecting…" : "Disconnect"}
            </button>
          )}
          {/* A plain link: the start route redirects to Google. */}
          <a
            href="/api/admin/scheduler/connect-google/start"
            className="inline-flex min-h-[44px] items-center justify-center rounded-control border border-outline bg-surface px-4 text-sm font-semibold text-ink-1 hover:bg-tile"
          >
            {connectLabel}
          </a>
        </div>
      </div>

      {notice?.kind === "connected" && (
        <div className="bg-status-healthy-bg text-status-healthy-text rounded-panel px-4 py-2.5 text-sm">
          Connected. New bookings and their emails now use this account.
        </div>
      )}
      {notice?.kind === "error" && (
        <div className="bg-status-watch-bg text-status-watch-text rounded-panel px-4 py-2.5 text-sm">
          {notice.reason || "Couldn't connect. Try again."}
        </div>
      )}

      {status.state === "active" && (
        <p className="text-sm text-ink-1">
          Using <span className="font-medium">{status.accountEmail}</span>
          {status.connectedByEmail || status.connectedAt ? (
            <span className="text-ink-3">
              {" "}
              · connected{status.connectedByEmail ? ` by ${status.connectedByEmail}` : ""}
              {status.connectedAt ? ` on ${fmtDate(status.connectedAt)}` : ""}
            </span>
          ) : null}
          .
        </p>
      )}
      {status.state === "error" && (
        <div className="bg-status-watch-bg text-status-watch-text rounded-panel px-4 py-2.5 text-sm">
          The scheduler stopped working for {status.accountEmail}. {status.reason ?? "Reconnect it."}
        </div>
      )}
      {status.state === "none" && (
        <p className="text-sm text-ink-2">Not connected. Connect the Google account whose calendar people should book.</p>
      )}

      <p className="text-xs text-ink-3">
        BloomOS asks Google for calendar access and permission to send email. It can&apos;t read the inbox.
      </p>
      {error && <p className="text-expense text-xs">{error}</p>}
    </section>
  );
}
