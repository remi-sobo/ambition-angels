"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Report-an-issue sheet, opened from the + FAB menu. Snap/attach a photo and/or
 * describe what's weird; on submit it POSTs multipart to /api/admin/report,
 * which stores the photo, files a task in the "BloomOS Upgrades" project, and
 * emails both operators. Mirrors QuickAddModal's bottom-sheet styling.
 */

type ReportType = "bug" | "confusing" | "idea";
const TYPES: { value: ReportType; label: string; emoji: string }[] = [
  { value: "bug", label: "Bug", emoji: "🐞" },
  { value: "confusing", label: "Confusing", emoji: "🤔" },
  { value: "idea", label: "Idea", emoji: "💡" },
];

export default function ReportModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<ReportType>("bug");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Revoke the object URL when the preview changes/unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function pickFile(f: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!description.trim() && !file) {
      setError("Add a description or a photo.");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("description", description.trim());
      fd.append("type", type);
      if (file) fd.append("photo", file);
      const r = await fetch("/api/admin/report", { method: "POST", body: fd });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      setSuccess(true);
      setTimeout(onClose, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the report");
    } finally {
      setSaving(false);
    }
  }

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
        <div className="sm:hidden flex justify-center pt-2.5 pb-1" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-tile" />
        </div>

        <form onSubmit={submit} className="p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-display font-bold uppercase tracking-tight text-ink-1">
              Report an issue
            </h2>
            <p className="text-xs text-ink-2 mt-0.5">
              Spotted something off? Snap it or describe it — it becomes a BloomOS Upgrade.
            </p>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1.5">Type</div>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border-[1.5px] text-sm font-medium transition-colors ${
                    type === t.value
                      ? "border-orange bg-orange/15 text-ink-1"
                      : "border-outline bg-tile text-ink-2 hover:text-ink-1"
                  }`}
                >
                  <span aria-hidden>{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">What&apos;s going on?</div>
            <textarea
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe what's weird, confusing, or what you'd improve…"
              className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2.5 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50 text-base sm:text-sm resize-y"
            />
          </label>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">Photo (optional)</div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            {previewUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Selected" className="w-full max-h-56 object-cover rounded-lg border-[1.5px] border-outline" />
                <button
                  type="button"
                  onClick={() => pickFile(null)}
                  className="absolute top-2 right-2 bg-black/60 text-white text-xs font-semibold px-2.5 py-1 rounded-full"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-[1.5px] border-dashed border-outline bg-tile text-ink-2 hover:text-ink-1 text-sm font-medium transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
                  <rect x="3" y="6" width="18" height="14" rx="2" />
                  <circle cx="12" cy="13" r="3.5" />
                  <path d="M8 6l1.2-2h5.6L16 6" />
                </svg>
                Take or upload a photo
              </button>
            )}
          </div>

          {error && <p className="text-expense text-xs">{error}</p>}
          {success && !error && <p className="text-revenue text-xs">Report sent — thank you.</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-sm text-ink-2 hover:text-ink-1 px-4 py-2.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              {saving ? "Sending…" : "Send report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
