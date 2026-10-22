"use client";

import { useState } from "react";
import Button from "../../../_components/ui/Button";
import Input, { Field, Textarea } from "../../../_components/ui/Input";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The AI thank-you draft in the acknowledgment panel (specs/needs-you-popout-
 * thank-yous.md, PR 4). Draft-then-edit: nothing is sent or stored. The person
 * copies the text or opens it in their own mail app, sends it themselves, and
 * then records it with Mark thanked.
 *
 * The client sends only the gift id, the kind, and an optional nudge; the
 * server loads every fact the model sees. Shown only when the panel's context
 * says canDraft (the org holds ai.ack_draft and the donor is not
 * do-not-contact).
 */

type Kind = "email" | "talking_points";
type Draft = { subject: string; body: string; points: string[] | null };

export default function AckDraft({
  giftId,
  major,
  email,
  onUsedEmail,
}: {
  giftId: string;
  /** A major gift leads with call talking points. */
  major: boolean;
  /** The donor's email, or null (no open-in-mail). */
  email: string | null;
  /** The person copied the email or opened it in mail: record it as email. */
  onUsedEmail: () => void;
}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nudge, setNudge] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(k: Kind) {
    setKind(k);
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const r = await fetch("/api/admin/acknowledgments/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gift_id: giftId, kind: k, nudge: nudge.trim() || undefined }),
      });
      const j = (await r.json().catch(() => null)) as (Draft & { error?: string }) | null;
      if (!r.ok || !j?.body) {
        setError(j?.error ?? "Couldn't draft this one. Try again.");
        return;
      }
      setDraft({ subject: j.subject, body: j.body, points: j.points ?? null });
    } catch {
      setError("Couldn't reach BloomOS. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setCopied(true);
      onUsedEmail();
    } catch {
      setError("Couldn't copy. Select the text and copy it by hand.");
    }
  }

  const mailto =
    draft && email
      ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
      : null;

  return (
    <div className="space-y-3 rounded-panel border border-hairline p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className={`${TYPE.fieldLabel} mr-auto`}>Draft a thank-you</p>
        {major && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => run("talking_points")}>
            {busy && kind === "talking_points" ? "Drafting…" : "Draft talking points"}
          </Button>
        )}
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => run("email")}>
          {busy && kind === "email" ? "Drafting…" : "Draft email"}
        </Button>
      </div>

      {error && <p className="text-xs font-medium text-status-critical-text">{error}</p>}

      {draft && (
        <div className="space-y-3">
          {draft.points && (
            <div>
              <p className={TYPE.metadata}>For the call</p>
              <ul className={`${TYPE.body} list-disc pl-5 space-y-1`}>
                {draft.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          <Field label={draft.points ? "Follow-up email subject" : "Subject"} htmlFor="ack-draft-subject">
            <Input
              id="ack-draft-subject"
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            />
          </Field>
          <Field label="Email" htmlFor="ack-draft-body">
            <Textarea
              id="ack-draft-body"
              rows={8}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </Button>
            {mailto ? (
              <a
                href={mailto}
                onClick={onUsedEmail}
                className="text-sm font-medium text-ink-2 hover:text-ink-1 underline underline-offset-2"
              >
                Open in mail
              </a>
            ) : (
              <span className={TYPE.metadata}>No email on file, so copy it into a letter or message.</span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              aria-label="Adjust the draft"
              placeholder="Adjust it: warmer, mention the gala…"
              value={nudge}
              maxLength={200}
              onChange={(e) => setNudge(e.target.value)}
            />
            <Button variant="ghost" size="sm" className="h-9" disabled={busy || !kind} onClick={() => kind && run(kind)}>
              Redraft
            </Button>
          </div>
          <p className={TYPE.metadata}>A draft to edit. Nothing is sent from here: send it yourself, then Mark thanked.</p>
        </div>
      )}
    </div>
  );
}
