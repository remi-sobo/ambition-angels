"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/admin/_components/Button";
import { StatusChip } from "@/app/admin/_components/StatusChip";
import { TYPE } from "@/lib/admin/typeScale";
import { CONSENT_LABEL, consentStatus } from "@/lib/comms/bank";
import { CONSENT_SCOPES, consentState, type ConsentRow } from "@/lib/comms/consent";
import type { StorySubjectView } from "@/lib/comms/stories";

/**
 * Consent, per subject (spec §7.3).
 *
 * The workflow this models is the one that actually happens at a youth-serving
 * org: a blanket photo/video release gets signed at intake, and then — for any
 * named feature — someone sends the guardian the actual draft and the actual
 * photo and waits for a reply. That waiting state is real, so it is a real
 * state here: `pending` shows as "asked, waiting" and does NOT publish.
 *
 * Revoke is one action with a confirm, and it is total. It takes effect
 * everywhere instantly, including editions in flight, and it outranks a
 * still-valid blanket release. We can't unsend a newsletter that already went
 * out; what we can do is make sure it never goes out again.
 */

const SCOPE_LABEL: Record<string, string> = {
  first_name: "First name",
  full_name: "Full name",
  photo: "Photo",
  video: "Video",
  quote: "Direct quote",
  outcome_details: "Outcome details",
};

function oneYearOut(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function ConsentRowView({
  row,
  onChanged,
}: {
  row: ConsentRow & { id: string; granted_by: string | null; notes: string | null };
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const state = consentState(row);

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/admin/comms/consents/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-hairline bg-tile px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={consentStatus(state)}>{CONSENT_LABEL[state] ?? state}</StatusChip>
        <span className="text-[11px] text-ink-2">
          {(row.scope ?? []).map((s) => SCOPE_LABEL[s] ?? s).join(", ")}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {row.revoked_at ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => patch({ revoke: false })}
            >
              Undo revoke
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (confirm("Revoke this consent? The story stops being usable everywhere, immediately.")) {
                  void patch({ revoke: true });
                }
              }}
            >
              Revoke
            </Button>
          )}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-ink-3">
        {row.granted_at
          ? `Granted ${row.granted_at}${row.granted_by ? ` by ${row.granted_by}` : ""}`
          : `Asked ${row.requested_at}, waiting`}
        {row.expires_at ? ` · expires ${row.expires_at}` : row.granted_at ? " · no expiry set" : ""}
        {row.revoked_at ? ` · revoked ${row.revoked_at.slice(0, 10)}` : ""}
      </p>
    </div>
  );
}

export default function ConsentPanel({
  subject,
  storyTitle,
}: {
  subject: StorySubjectView;
  storyTitle: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [scopes, setScopes] = useState<string[]>(["first_name", "photo"]);
  const [grantedBy, setGrantedBy] = useState("");
  const [grantedAt, setGrantedAt] = useState(today());
  const [expiresAt, setExpiresAt] = useState(oneYearOut());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A redacted subject's consent rows are withheld along with their identity —
  // the guardian's name is exactly the kind of thing comms.subjects.read
  // exists to gate. The state chip still shows, so the story still explains
  // why it's blocked.
  if (subject.redacted) {
    return (
      <p className="text-[11px] text-ink-3">
        Consent details are hidden — you don&apos;t have permission to see who this is.
      </p>
    );
  }

  const rows = (subject.consents ?? []) as Array<
    ConsentRow & { id: string; granted_by: string | null; notes: string | null }
  >;

  async function submit(mode: "grant" | "request") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/comms/subjects/${subject.id}/consents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "grant"
            ? { scope: scopes, granted_by: grantedBy.trim() || "self", granted_at: grantedAt, expires_at: expiresAt || null }
            : { scope: scopes, requested_at: today() },
        ),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not record that.");
        return;
      }
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const draft = encodeURIComponent(
    `Hi — we'd love to feature ${subject.display_label} in our next update.\n\n` +
      `Here's what we'd say:\n\n"${storyTitle}"\n\n` +
      `We won't publish anything until you say yes. Just reply to this email either way — ` +
      `and if you'd rather we didn't, that's completely fine.\n\nThank you.`,
  );

  return (
    <div className="space-y-2">
      {rows.length === 0 && !adding && (
        <p className="text-[11px] text-ink-3">
          No consent on record. This story can&apos;t be used until there is.
        </p>
      )}

      {rows.map((r) => (
        <ConsentRowView key={r.id} row={r} onChanged={() => router.refresh()} />
      ))}

      {adding ? (
        <div className="rounded-card border border-hairline bg-tile p-3 space-y-3">
          <div>
            <span className={TYPE.cardLabel}>What are they saying yes to?</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CONSENT_SCOPES.map((s) => {
                const on = scopes.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setScopes((prev) => (on ? prev.filter((x) => x !== s) : [...prev, s]))
                    }
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors ${
                      on
                        ? "bg-orange text-white border-orange"
                        : "bg-surface text-ink-2 border-hairline hover:border-outline"
                    }`}
                  >
                    {SCOPE_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="block">
              <span className={TYPE.cardLabel}>Granted by</span>
              <input
                value={grantedBy}
                onChange={(e) => setGrantedBy(e.target.value)}
                placeholder="Guardian's name, or 'self'"
                className="mt-1 w-full rounded-card bg-surface border border-hairline px-2 py-1.5 text-xs text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange"
              />
            </label>
            <label className="block">
              <span className={TYPE.cardLabel}>Granted on</span>
              <input
                type="date"
                value={grantedAt}
                onChange={(e) => setGrantedAt(e.target.value)}
                className="mt-1 w-full rounded-card bg-surface border border-hairline px-2 py-1.5 text-xs text-ink-1 focus:outline-none focus:border-orange"
              />
            </label>
            <label className="block">
              <span className={TYPE.cardLabel}>Expires</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1 w-full rounded-card bg-surface border border-hairline px-2 py-1.5 text-xs text-ink-1 focus:outline-none focus:border-orange"
              />
            </label>
          </div>
          <p className="text-[11px] text-ink-3">
            A sunset is best practice — it forces the conversation again rather than letting a
            release from three years ago quietly cover today&apos;s newsletter.
          </p>

          {error && (
            <p className="text-[11px] text-status-critical-text bg-status-critical-bg rounded-card px-2 py-1.5">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy || scopes.length === 0} onClick={() => submit("grant")}>
              Record consent
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || scopes.length === 0}
              onClick={() => submit("request")}
            >
              Mark as asked
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            Add consent
          </Button>
          {/* The taught workflow: send the guardian the actual draft and photo.
              Sending stays in the org's own email — this just makes the ask a
              30-second act instead of a task someone means to get to. */}
          <a
            href={`mailto:?subject=${encodeURIComponent("Can we share this?")}&body=${draft}`}
            className="text-[11px] text-ink-2 underline underline-offset-2 hover:text-ink-1"
          >
            Draft the ask
          </a>
        </div>
      )}
    </div>
  );
}
