"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ACK_CHANNELS,
  ACK_SUBJECT_TYPES,
  CHANNEL_LABEL,
  SUBJECT_TYPE_LABEL,
} from "@/lib/fundraising/ack-channels";

export type AckTemplate = {
  id: string;
  name: string;
  subject_type: string;
  channel: string;
  subject: string | null;
  body: string;
  is_default: boolean;
};

type Form = {
  name: string;
  subject_type: string;
  channel: string;
  subject: string;
  body: string;
  is_default: boolean;
};

const EMPTY: Form = {
  name: "",
  subject_type: "gift",
  channel: "email",
  subject: "",
  body: "",
  is_default: false,
};

export default function TemplateManager({ initial }: { initial: AckTemplate[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const startNew = () => {
    setForm(EMPTY);
    setEditing("new");
    setError("");
  };
  const startEdit = (t: AckTemplate) => {
    setForm({
      name: t.name,
      subject_type: t.subject_type,
      channel: t.channel,
      subject: t.subject ?? "",
      body: t.body,
      is_default: t.is_default,
    });
    setEditing(t.id);
    setError("");
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError("");
    const isNew = editing === "new";
    const url = isNew
      ? "/api/admin/fundraising/ack-templates"
      : `/api/admin/fundraising/ack-templates/${editing}`;
    try {
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/fundraising/ack-templates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const field = "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm focus:outline-none focus:border-orange/40";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={startNew}
          disabled={editing === "new"}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
        >
          + New template
        </button>
        {error && <span className="text-expense text-xs">{error}</span>}
      </div>

      {editing && (
        <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Template name"
              className={`${field} sm:col-span-1`}
            />
            <select
              value={form.subject_type}
              onChange={(e) => setForm({ ...form, subject_type: e.target.value })}
              className={field}
            >
              {ACK_SUBJECT_TYPES.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_TYPE_LABEL[s]}
                </option>
              ))}
            </select>
            <select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
              className={field}
            >
              {ACK_CHANNELS.map((ch) => (
                <option key={ch} value={ch}>
                  {CHANNEL_LABEL[ch]}
                </option>
              ))}
            </select>
          </div>

          {form.channel === "email" && (
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Email subject line"
              className={`${field} w-full`}
            />
          )}

          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={6}
            placeholder="Hi {{first_name}}, thank you so much for your gift…"
            className={`${field} w-full leading-relaxed placeholder-ink-3`}
          />

          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-ink-2">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              />
              Default for this channel
            </label>
            <span className="text-[11px] text-ink-3">
              Merge token: <code className="text-orange">{"{{first_name}}"}</code>
            </span>
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setEditing(null)}
                disabled={busy}
                className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save template"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
        {initial.length === 0 ? (
          <p className="p-8 text-ink-2 text-sm">
            No templates yet. Create one to give every thank-you a consistent, on-brand starting point.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {initial.map((t) => (
              <li key={t.id} className="px-5 py-4 flex items-start gap-4 group">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-ink-1 font-medium">{t.name}</span>
                    {t.is_default && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange/15 text-orange uppercase tracking-wider">
                        Default
                      </span>
                    )}
                    <span className="text-[10px] uppercase tracking-wider text-ink-3">
                      {SUBJECT_TYPE_LABEL[t.subject_type] ?? t.subject_type} · {CHANNEL_LABEL[t.channel] ?? t.channel}
                    </span>
                  </div>
                  {t.subject && <div className="text-xs text-ink-2 mt-1">{t.subject}</div>}
                  <p className="text-xs text-ink-3 mt-1 line-clamp-2 whitespace-pre-wrap">{t.body}</p>
                </div>
                <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(t)}
                    className="text-[11px] font-semibold text-ink-2 hover:text-ink-1 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => del(t.id)}
                    disabled={busy}
                    className="text-[11px] font-semibold text-ink-2 hover:text-expense transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
