"use client";

// Client controls for donor comms (Epic I): compose a campaign, send a test,
// send to the segment, delete. Sending real email is gated behind an explicit
// confirm with the resolved recipient context.

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";
const labelCls = "flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold";

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
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setName(""); setSubject(""); setBody(""); setSegmentId("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
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
    <form onSubmit={submit} className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-4 space-y-3 w-full">
      <div className="flex flex-wrap gap-3">
        <label className={labelCls + " flex-1 min-w-[12rem]"}>
          Campaign name *
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="FY26 lapsed re-engagement" className={inputCls + " w-full"} />
        </label>
        <label className={labelCls}>
          Segment
          <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} className={inputCls + " w-52"}>
            <option value="" className="bg-tile shadow-tile">— pick to enable send —</option>
            {segments.map((s) => (<option key={s.id} value={s.id} className="bg-tile shadow-tile">{s.name}</option>))}
          </select>
        </label>
      </div>
      <label className={labelCls + " block"}>
        Subject *
        <input required value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls + " w-full"} />
      </label>
      <label className={labelCls + " block"}>
        Body — plain text, blank line = new paragraph, {"{{first_name}}"} personalizes
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
  const [busy, setBusy] = useState(false);

  const test = async () => {
    const email = prompt("Send a test copy to which email?")?.trim();
    if (!email) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/comms/${id}/test`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      const j = await res.json().catch(() => ({}));
      alert(res.ok ? `Test sent to ${email}.` : (j.error ?? "Test failed"));
    } finally { setBusy(false); }
  };

  const send = async () => {
    if (!confirm("Send this campaign to everyone in the segment? This emails real donors and can't be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/comms/${id}/send`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.ok) alert(`Sent to ${j.sent} of ${j.recipients} recipients${j.failed ? ` (${j.failed} failed)` : ""}.`);
      else alert(j.error ?? "Send failed");
      router.refresh();
    } finally { setBusy(false); }
  };

  const del = async () => {
    if (!confirm("Delete this campaign?")) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/comms/${id}`, { method: "DELETE" });
      router.refresh();
    } finally { setBusy(false); }
  };

  return (
    <span className="flex items-center gap-3">
      <button disabled={busy} onClick={test} className="text-[11px] font-semibold text-ink-2 hover:text-ink-1 transition-colors disabled:opacity-50">Test</button>
      {status === "draft" && (
        <button
          disabled={busy || !hasSegment}
          title={hasSegment ? undefined : "Attach a segment first"}
          onClick={send}
          className="text-[11px] font-semibold text-revenue hover:text-revenue transition-colors disabled:opacity-40"
        >
          Send
        </button>
      )}
      <button disabled={busy} onClick={del} className="text-[11px] font-semibold text-ink-3 hover:text-expense transition-colors disabled:opacity-50">Delete</button>
    </span>
  );
}
