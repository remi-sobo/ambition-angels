"use client";

// Client controls for donor comms (Epic I): compose a campaign, send a test,
// send now or schedule (G2: both only queue; the worker sends), cancel, delete. Sending real email is gated behind an explicit
// confirm with the resolved recipient context.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";

type Option = { id: string; name: string };

const inputCls =
  "bg-tile border-hairline rounded-control px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";
const labelCls = "flex flex-col gap-1 text-xs uppercase tracking-wider text-ink-3 font-semibold";

export function NewCampaignForm({ segments }: { segments: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [segmentId, setSegmentId] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/comms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject, body, segment_id: segmentId || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(userMessage(res, j));
        return;
      }
      setName(""); setSubject(""); setBody(""); setSegmentId("");
      setOpen(false);
      router.refresh();
    } catch {
      setError(networkMessage());
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors">
        + New campaign
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="bg-tile border-hairline rounded-panel-lg p-4 space-y-3 w-full">
      <div className="flex flex-wrap gap-3">
        <label className={labelCls + " flex-1 min-w-[12rem]"}>
          Campaign name *
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="FY26 lapsed re-engagement" className={inputCls + " w-full"} />
        </label>
        <label className={labelCls}>
          Segment
          <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} className={inputCls + " w-52"}>
            <option value="" className="bg-tile">(pick to enable send)</option>
            {segments.map((s) => (<option key={s.id} value={s.id} className="bg-tile">{s.name}</option>))}
          </select>
        </label>
      </div>
      <label className={labelCls + " block"}>
        Subject *
        <input required value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls + " w-full"} />
      </label>
      <label className={labelCls + " block"}>
        Body: plain text, blank line = new paragraph, {"{{first_name}}"} personalizes
        <textarea required value={body} onChange={(e) => setBody(e.target.value)} rows={8} className={inputCls + " w-full resize-y font-body"} placeholder={"Hi {{first_name}},\n\nThank you for believing in our teens…"} />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Save draft"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-2 py-2 transition-colors">
          Cancel
        </button>
      </div>
      {error && <p className="text-expense text-xs">{error}</p>}
    </form>
  );
}

export function CampaignActions({ id, status, hasSegment }: { id: string; status: string; hasSegment: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  // null = the test-email input is closed (the native prompt is banned; this inline
  // input is its replacement).
  const [testEmail, setTestEmail] = useState<string | null>(null);
  // null = the schedule picker is closed; otherwise a datetime-local value.
  const [scheduleAt, setScheduleAt] = useState<string | null>(null);

  const test = async () => {
    const email = testEmail?.trim();
    if (!email) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/comms/${id}/test`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Test sent to ${email}.`);
        setTestEmail(null);
      } else {
        toast.error(userMessage(res, j));
      }
    } finally { setBusy(false); }
  };

  const send = async (scheduledAt: string | null) => {
    const when = scheduledAt ? new Date(scheduledAt) : null;
    // Resolve the segment first, so the confirm names who it will email.
    setBusy(true);
    let preview: { recipients: number; excluded: { doNotContact: number; suppressed: number; noEmail: number }; maxRecipients: number };
    try {
      const res = await fetch(`/api/admin/comms/${id}/send`, { method: "GET" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(userMessage(res, j)); return; }
      preview = j;
    } catch {
      toast.error(networkMessage());
      return;
    } finally { setBusy(false); }
    if (preview.recipients === 0) {
      toast.error("This segment has no one to email.");
      return;
    }
    const people = `${preview.recipients.toLocaleString("en-US")} ${preview.recipients === 1 ? "person" : "people"}`;
    const { doNotContact, suppressed, noEmail } = preview.excluded;
    const leftOut = [
      doNotContact ? `${doNotContact} do not contact` : "",
      suppressed ? `${suppressed} unsubscribed or bounced` : "",
      noEmail ? `${noEmail} with no email` : "",
    ].filter(Boolean);
    const leftOutLine = leftOut.length ? ` Left out: ${leftOut.join(", ")}.` : " No one in the segment is left out.";
    const capLine = preview.recipients > preview.maxRecipients
      ? ` That is over the ${preview.maxRecipients.toLocaleString("en-US")} limit, so it will be refused. Narrow the segment first.`
      : "";
    const ok = await confirm({
      title: when
        ? `Schedule this campaign to ${people} for ${when.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}?`
        : `Send this campaign to ${people}?`,
      body: (when
        ? "It emails real donors at that time. You can cancel it until then."
        : "It starts emailing real donors within a minute. You can cancel the part that hasn't gone yet.") + leftOutLine + capLine,
      confirmLabel: when ? `Schedule for ${people}` : `Send to ${people}`,
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/comms/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(when ? { scheduled_at: when.toISOString() } : {}),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const head = when ? `Scheduled for ${j.queued} recipients.` : `Queued for ${j.queued} recipients. Sending starts within a minute.`;
        toast.success(j.note ? `${head} ${j.note}` : head);
        setScheduleAt(null);
      } else toast.error(userMessage(res, j));
      router.refresh();
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    const ok = await confirm({
      title: "Cancel this campaign?",
      body: "Emails already sent stay sent. Everyone still waiting is skipped.",
      confirmLabel: "Cancel campaign",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/comms/${id}/cancel`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.ok) toast.success(`Canceled. ${j.skipped} emails won't go out.`);
      else toast.error(userMessage(res, j));
      router.refresh();
    } finally { setBusy(false); }
  };

  const del = async () => {
    const ok = await confirm({
      title: "Delete this campaign?",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/comms/${id}`, { method: "DELETE" });
      router.refresh();
    } finally { setBusy(false); }
  };

  if (testEmail !== null) {
    return (
      <span className="flex items-center gap-2">
        <input
          autoFocus
          type="email"
          aria-label="Send a test to"
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void test(); if (e.key === "Escape") setTestEmail(null); }}
          placeholder="Test copy to which email?"
          className="bg-tile border-hairline rounded-control px-2 py-1 text-ink-1 text-xs w-48 placeholder-ink-3 focus:outline-none focus:border-orange/40"
        />
        <button disabled={busy || !testEmail.trim()} onClick={test} className="text-xs font-semibold text-orange hover:text-orange-dark transition-colors disabled:opacity-50">Send test</button>
        <button disabled={busy} onClick={() => setTestEmail(null)} className="text-xs font-semibold text-ink-3 hover:text-ink-1 transition-colors disabled:opacity-50">Cancel</button>
      </span>
    );
  }

  if (scheduleAt !== null) {
    return (
      <span className="flex items-center gap-2">
        <input
          autoFocus
          type="datetime-local"
          aria-label="Send at"
          value={scheduleAt}
          onChange={(e) => setScheduleAt(e.target.value)}
          className="bg-tile border-hairline rounded-control px-2 py-1 text-ink-1 text-xs focus:outline-none focus:border-orange/40"
        />
        <button disabled={busy || !scheduleAt} onClick={() => send(scheduleAt)} className="text-xs font-semibold text-orange hover:text-orange-dark transition-colors disabled:opacity-50">Schedule</button>
        <button disabled={busy} onClick={() => setScheduleAt(null)} className="text-xs font-semibold text-ink-3 hover:text-ink-1 transition-colors disabled:opacity-50">Cancel</button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-3">
      <button disabled={busy} onClick={() => setTestEmail("")} className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors disabled:opacity-50">Test</button>
      {status === "draft" && (
        <button
          disabled={busy || !hasSegment}
          title={hasSegment ? undefined : "Attach a segment first"}
          onClick={() => send(null)}
          className="text-xs font-semibold text-revenue hover:text-revenue transition-colors disabled:opacity-40"
        >
          Send
        </button>
      )}
      {status === "draft" && (
        <button
          disabled={busy || !hasSegment}
          title={hasSegment ? undefined : "Attach a segment first"}
          onClick={() => setScheduleAt("")}
          className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors disabled:opacity-40"
        >
          Schedule
        </button>
      )}
      {(status === "scheduled" || status === "sending") && (
        <button disabled={busy} onClick={cancel} className="text-xs font-semibold text-ink-2 hover:text-expense transition-colors disabled:opacity-50">
          Cancel
        </button>
      )}
      {status !== "scheduled" && status !== "sending" && (
      <button disabled={busy} onClick={del} className="text-xs font-semibold text-ink-3 hover:text-expense transition-colors disabled:opacity-50">Delete</button>
      )}
    </span>
  );
}
