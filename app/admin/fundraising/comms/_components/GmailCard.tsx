"use client";

// Connect Gmail (specs/comms-v2-gmail-amendment.md G1): which Google account
// this org's campaigns send from. Connecting goes through Google's own
// account chooser; only org admins can connect or disconnect (the routes
// enforce it, this card just hides the buttons for everyone else).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";
import type { GmailConnectionStatus } from "@/lib/comms/gmail-connection";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export type GmailNotice = { kind: "connected" | "cancelled" | "error"; reason?: string } | null;

export function GmailCard({
  status,
  transport,
  canManage,
  notice,
}: {
  status: GmailConnectionStatus;
  transport: "gmail" | "resend" | null;
  canManage: boolean;
  notice: GmailNotice;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const disconnect = async () => {
    if (status.state === "none") return;
    const ok = await confirm({
      title: "Disconnect Gmail?",
      body: `Campaigns stop sending from ${status.accountEmail} until someone connects an account again. Mail already sent stays in that account's Sent folder.`,
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/comms/connect-gmail", { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(userMessage(res, j));
      router.replace("/admin/fundraising/comms");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : networkMessage());
    } finally {
      setBusy(false);
    }
  };

  const connectLabel = status.state === "none" ? "Connect Gmail" : "Reconnect";

  return (
    <section className="bg-tile border-hairline rounded-panel-lg p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-wider text-ink-3 font-semibold">Send from Gmail</h2>
        {canManage && (
          <div className="flex items-center gap-3">
            {status.state !== "none" && (
              <button
                onClick={disconnect}
                disabled={busy}
                className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors disabled:opacity-50"
              >
                {busy ? "Disconnecting…" : "Disconnect"}
              </button>
            )}
            {/* A plain link: the start route redirects to Google. */}
            <a
              href="/api/admin/comms/connect-gmail/start"
              className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors"
            >
              {connectLabel}
            </a>
          </div>
        )}
      </div>

      {notice?.kind === "connected" && (
        <div className="bg-status-healthy-bg text-status-healthy-text rounded-panel px-4 py-2.5 text-sm">
          Gmail connected. Campaigns now send from this account.
        </div>
      )}
      {notice?.kind === "error" && (
        <div className="bg-status-watch-bg text-status-watch-text rounded-panel px-4 py-2.5 text-sm">
          {notice.reason || "Couldn't connect Gmail. Try again."}
        </div>
      )}

      {status.state === "active" && (
        <p className="text-sm text-ink-1">
          Sending as <span className="font-medium">{status.accountEmail}</span>
          {status.connectedByEmail || status.connectedAt ? (
            <span className="text-ink-3">
              {" "}
              · connected{status.connectedByEmail ? ` by ${status.connectedByEmail}` : ""}
              {status.connectedAt ? ` on ${fmtDate(status.connectedAt)}` : ""}
            </span>
          ) : null}
          . Mail lands in that account&apos;s Sent folder and replies come back to its inbox.
        </p>
      )}

      {status.state === "error" && (
        <div className="bg-status-watch-bg text-status-watch-text rounded-panel px-4 py-2.5 text-sm">
          Gmail stopped working for {status.accountEmail}. {status.reason ?? "Reconnect it to send again."}
        </div>
      )}

      {status.state === "none" && (
        <p className="text-sm text-ink-2">
          {transport === "resend"
            ? "Campaigns currently send through the platform's email service. Connect a Gmail account to send from your own inbox instead."
            : "Connect the Google account your campaigns should come from. A shared inbox (like hello@yourorg.org) works best: sending won't stop if someone leaves."}
          {!canManage && " An org admin has to connect it."}
        </p>
      )}

      <p className="text-xs text-ink-3">
        BloomOS only asks Google for permission to send. It can&apos;t read the inbox.
      </p>
      {error && <p className="text-expense text-xs">{error}</p>}
    </section>
  );
}
