"use client";

// Sending identity card (org_comms_settings): who campaign email comes from,
// the reply-to, the CAN-SPAM mailing address, and the daily cap. Sends refuse
// until from + mailing address are set. Edits require org.manage (the API
// returns 403 otherwise).

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CommsSettings = {
  from_name: string;
  from_email: string;
  reply_to: string | null;
  mailing_address: string;
  footer_text: string | null;
  daily_send_cap: number;
};

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";
const labelCls = "flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold";

export function SettingsCard({ settings }: { settings: CommsSettings | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    from_name: settings?.from_name ?? "",
    from_email: settings?.from_email ?? "",
    reply_to: settings?.reply_to ?? "",
    mailing_address: settings?.mailing_address ?? "",
    footer_text: settings?.footer_text ?? "",
    daily_send_cap: settings?.daily_send_cap ?? 2000,
  });

  const incomplete = !settings || !settings.from_email.trim() || !settings.mailing_address.trim();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/comms/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, reply_to: form.reply_to || null, footer_text: form.footer_text || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold">Sending identity</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-[11px] font-semibold text-ink-2 hover:text-ink-1 transition-colors">
            Edit
          </button>
        )}
      </div>

      {incomplete && !editing && (
        <div className="bg-[#F4E8D0] text-[#A56A1B] rounded-xl px-4 py-2.5 text-sm">
          Sending is disabled until a from address and mailing address are configured
          {settings ? "" : " (settings row missing — apply comms_v2_phase1_tables.sql)"}.
        </div>
      )}

      {!editing ? (
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-ink-3">From</dt>
            <dd className="text-ink-1 truncate">
              {settings?.from_email ? `${settings.from_name} <${settings.from_email}>` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-ink-3">Reply-to</dt>
            <dd className="text-ink-1 truncate">{settings?.reply_to || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-ink-3">Mailing address</dt>
            <dd className="text-ink-1 truncate">{settings?.mailing_address || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-ink-3">Daily cap</dt>
            <dd className="text-ink-1 [font-variant-numeric:tabular-nums]">{settings?.daily_send_cap ?? "—"}</dd>
          </div>
        </dl>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <label className={labelCls}>
              From name
              <input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} className={inputCls} />
            </label>
            <label className={labelCls}>
              From email
              <input type="email" value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} placeholder="you@mail.yourdomain.org" className={inputCls} />
            </label>
            <label className={labelCls}>
              Reply-to
              <input type="email" value={form.reply_to} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} placeholder="optional" className={inputCls} />
            </label>
            <label className={labelCls + " lg:col-span-2"}>
              Mailing address (CAN-SPAM)
              <input value={form.mailing_address} onChange={(e) => setForm({ ...form, mailing_address: e.target.value })} className={inputCls} />
            </label>
            <label className={labelCls}>
              Footer text
              <input value={form.footer_text} onChange={(e) => setForm({ ...form, footer_text: e.target.value })} placeholder="EIN, tagline…" className={inputCls} />
            </label>
            <label className={labelCls}>
              Daily send cap
              <input type="number" min={1} max={100000} value={form.daily_send_cap} onChange={(e) => setForm({ ...form, daily_send_cap: Number(e.target.value) })} className={inputCls} />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => { setEditing(false); setError(""); }} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-2 py-2 transition-colors">
              Cancel
            </button>
          </div>
          {error && <p className="text-expense text-xs">{error}</p>}
        </form>
      )}
    </section>
  );
}
