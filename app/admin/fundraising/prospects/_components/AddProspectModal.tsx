"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Manually add a prospect to the bench. The simplest intake — someone you know
// is worth tracking, no HubSpot record needed. POSTs to /prospects/add.

const TYPES = [
  { value: "individual", label: "Individual" },
  { value: "foundation", label: "Foundation" },
  { value: "corporate", label: "Corporate" },
] as const;

export default function AddProspectModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("individual");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/fundraising/prospects/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          email: email.trim() || undefined,
          org_name: org.trim() || undefined,
          strategy_note: note.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b?.error ?? `HTTP ${r.status}`);
      }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add prospect");
    } finally {
      setSaving(false);
    }
  }

  const fieldCls =
    "w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2.5 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50 text-base sm:text-sm";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4"
      onClick={() => !saving && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-card border-[1.5px] border-outline bg-ink shadow-2xl max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <form onSubmit={submit} className="p-5 sm:p-6 space-y-4">
          <h2 className="text-lg font-display font-bold uppercase tracking-tight text-ink-1">Add prospect</h2>

          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">Name <span className="text-orange">*</span></div>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Person or organization" className={fieldCls} />
          </label>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1.5">Type</div>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`py-2 rounded-lg border-[1.5px] text-sm font-medium transition-colors ${
                    type === t.value ? "border-orange bg-orange/15 text-ink-1" : "border-outline bg-tile text-ink-2 hover:text-ink-1"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">Email</div>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" className={fieldCls} />
            </label>
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">Organization</div>
              <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="optional" className={fieldCls} />
            </label>
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">Why / angle</div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Why they're a fit (optional)" className={`${fieldCls} resize-y`} />
            </label>
          </div>

          {error && <p className="text-expense text-xs">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="text-sm text-ink-2 hover:text-ink-1 px-4 py-2.5">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors">
              {saving ? "Adding…" : "Add to bench"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
