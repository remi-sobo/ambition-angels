"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSpeechRecognition } from "@/lib/hooks/useSpeechRecognition";

/**
 * Report-an-issue sheet, opened from the + FAB / rail dock.
 *
 * Idea + Confusing stay a fast one-shot: describe it (type or voice), optionally
 * snap a photo, send — it becomes a task in "BloomOS Upgrades" and emails both
 * operators, exactly as before.
 *
 * Bug is now a guided debugging interview. Shannon/Remi describe what's off (by
 * voice or text); Claude asks a couple of focused follow-ups (current behavior,
 * expected behavior, where, repro), then synthesizes a ready-to-paste Claude
 * Code debugging prompt. They copy it straight into Claude Code and/or file it
 * as a task — no hand-crafting the prompt through a back-and-forth.
 */

type ReportType = "bug" | "confusing" | "idea";
const TYPES: { value: ReportType; label: string; emoji: string }[] = [
  { value: "bug", label: "Bug", emoji: "🐞" },
  { value: "confusing", label: "Confusing", emoji: "🤔" },
  { value: "idea", label: "Idea", emoji: "💡" },
];

type Turn = { role: "user" | "assistant"; content: string };
// describe → (bug only) chat → ready → done; simple types skip straight to done.
type Phase = "describe" | "chat" | "ready" | "done";

export default function ReportModal({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const [type, setType] = useState<ReportType>("bug");
  const [phase, setPhase] = useState<Phase>("describe");

  // Shared intake.
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Bug conversation.
  const [turns, setTurns] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState("");
  const [thinking, setThinking] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [promptTitle, setPromptTitle] = useState("");
  const [copied, setCopied] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = thinking || saving;

  // Close on Escape (never while mid-request).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  // ── Bug: run one conversation turn against the debug endpoint. ─────────────
  async function runDebug(nextTurns: Turn[]) {
    setError(null);
    setThinking(true);
    try {
      const r = await fetch("/api/admin/report/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turns: nextTurns,
          hasPhoto: !!file,
          pageContext: { path: pathname, title: typeof document !== "undefined" ? document.title : "" },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`);

      if (data.action === "ready") {
        setPrompt(String(data.prompt ?? ""));
        setPromptTitle(String(data.title ?? ""));
        setPhase("ready");
      } else if (data.action === "ask" && data.message) {
        setTurns([...nextTurns, { role: "assistant", content: String(data.message) }]);
        setPhase("chat");
      } else {
        throw new Error("Unexpected reply from the assistant.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the assistant.");
    } finally {
      setThinking(false);
    }
  }

  function startBug(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setError("Tell me what's going on first.");
      return;
    }
    const first: Turn[] = [{ role: "user", content: description.trim() }];
    setTurns(first);
    runDebug(first);
  }

  function sendAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: answer.trim() }];
    setTurns(next);
    setAnswer("");
    runDebug(next);
  }

  // ── Simple types (idea/confusing): one-shot submit. ────────────────────────
  async function submitSimple(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!description.trim() && !file) {
      setError("Add a description or a photo.");
      return;
    }
    await fileReport({ description: description.trim() });
  }

  // ── Final task creation (shared by simple types and the bug "ready" step). ─
  async function fileReport(opts: { description: string; debugPrompt?: string }) {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("description", opts.description);
      if (opts.debugPrompt) {
        fd.append("debugPrompt", opts.debugPrompt);
        if (promptTitle) fd.append("title", promptTitle);
        fd.append("transcript", JSON.stringify(turns));
      }
      if (file) fd.append("photo", file);
      const r = await fetch("/api/admin/report", { method: "POST", body: fd });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      setPhase("done");
      setTimeout(onClose, opts.debugPrompt ? 1200 : 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the report");
    } finally {
      setSaving(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy. Select the text and copy manually.");
    }
  }

  // Switching type resets the flow back to the intake step.
  function chooseType(t: ReportType) {
    setType(t);
    setPhase("describe");
    setTurns([]);
    setAnswer("");
    setPrompt("");
    setError(null);
  }

  const isBug = type === "bug";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4"
      onClick={() => !busy && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-card border-[1.5px] border-outline bg-ink shadow-2xl max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="sm:hidden flex justify-center pt-2.5 pb-1" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-tile" />
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-display font-bold uppercase tracking-tight text-ink-1">
              {isBug ? "Report a bug" : "Report an issue"}
            </h2>
            <p className="text-xs text-ink-2 mt-0.5">
              {isBug
                ? "Tell me what's off. I'll ask a couple of quick questions, then hand you a ready-to-paste fix prompt."
                : "Spotted something off? Snap it or describe it — it becomes a BloomOS Upgrade."}
            </p>
          </div>

          {/* Type selector — hidden once a bug interview is underway. */}
          {!(isBug && phase !== "describe") && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1.5">Type</div>
              <div className="grid grid-cols-3 gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => chooseType(t.value)}
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
          )}

          {/* ── Done state. ── */}
          {phase === "done" && (
            <p className="text-revenue text-sm py-4 text-center">
              {isBug ? "Filed as a BloomOS Upgrade — thank you." : "Report sent — thank you."}
            </p>
          )}

          {/* ── Describe step (intake): shared by all types. ── */}
          {phase === "describe" && (
            <form onSubmit={isBug ? startBug : submitSimple} className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">
                  {isBug ? "What's going wrong?" : "What's going on?"}
                </div>
                <div className="relative">
                  <textarea
                    autoFocus
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder={
                      isBug
                        ? "Describe what you did, what happened, and what you expected instead…"
                        : "Describe what's weird, confusing, or what you'd improve…"
                    }
                    className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2.5 pr-12 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50 text-base sm:text-sm resize-y"
                  />
                  <MicButton onAppend={(t) => setDescription((d) => joinSpeech(d, t))} />
                </div>
              </div>

              <PhotoPicker
                fileRef={fileRef}
                previewUrl={previewUrl}
                onPick={pickFile}
              />

              {error && <p className="text-expense text-xs">{error}</p>}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="text-sm text-ink-2 hover:text-ink-1 px-4 py-2.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
                >
                  {isBug
                    ? thinking
                      ? "Thinking…"
                      : "Start debugging"
                    : saving
                    ? "Sending…"
                    : "Send report"}
                </button>
              </div>
            </form>
          )}

          {/* ── Bug: conversation. ── */}
          {phase === "chat" && (
            <div className="space-y-4">
              <div className="space-y-2.5 max-h-[42vh] overflow-y-auto pr-1">
                {turns.map((t, i) => (
                  <ChatBubble key={i} role={t.role} text={t.content} />
                ))}
                {thinking && <ChatBubble role="assistant" text="…" muted />}
              </div>

              <form onSubmit={sendAnswer} className="space-y-3">
                <div className="relative">
                  <textarea
                    autoFocus
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendAnswer(e);
                    }}
                    rows={2}
                    placeholder="Answer here, or tap the mic to talk…"
                    className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2.5 pr-12 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50 text-base sm:text-sm resize-y"
                  />
                  <MicButton onAppend={(t) => setAnswer((d) => joinSpeech(d, t))} />
                </div>

                {error && <p className="text-expense text-xs">{error}</p>}

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                    className="text-sm text-ink-2 hover:text-ink-1 px-2 py-2.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !answer.trim()}
                    className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
                  >
                    {thinking ? "Thinking…" : "Send"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── Bug: the synthesized Claude Code prompt. ── */}
          {phase === "ready" && (
            <div className="space-y-4">
              <div className="text-[10px] uppercase tracking-wider text-ink-2">
                Your Claude Code prompt
              </div>
              <pre className="whitespace-pre-wrap bg-tile border-[1.5px] border-outline rounded-lg p-3 text-xs text-ink-1 max-h-[44vh] overflow-y-auto font-mono leading-relaxed">
                {prompt}
              </pre>

              {error && <p className="text-expense text-xs">{error}</p>}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="w-full bg-orange hover:bg-orange-dark text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
                >
                  {copied ? "Copied ✓" : "Copy prompt"}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileReport({ description: turns[0]?.content ?? "", debugPrompt: prompt })}
                    disabled={saving}
                    className="flex-1 border-[1.5px] border-outline bg-tile hover:text-ink-1 text-ink-2 text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save as task"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAnswer("");
                      setPhase("chat");
                    }}
                    disabled={saving}
                    className="text-sm text-ink-2 hover:text-ink-1 px-3 py-2.5"
                  >
                    Add more
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Append a finalized speech chunk to existing text, fixing up spacing. */
function joinSpeech(existing: string, chunk: string): string {
  const c = chunk.trim();
  if (!c) return existing;
  if (!existing) return c.charAt(0).toUpperCase() + c.slice(1);
  return /\s$/.test(existing) ? existing + c : existing + " " + c;
}

function ChatBubble({ role, text, muted }: { role: Turn["role"]; text: string; muted?: boolean }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-orange/15 border border-orange/30 text-ink-1 rounded-br-sm"
            : `bg-tile border border-outline rounded-bl-sm ${muted ? "text-ink-3" : "text-ink-1"}`
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function PhotoPicker({
  fileRef,
  previewUrl,
  onPick,
}: {
  fileRef: React.RefObject<HTMLInputElement>;
  previewUrl: string | null;
  onPick: (f: File | null) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">Photo (optional)</div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="hidden"
      />
      {previewUrl ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Selected" className="w-full max-h-56 object-cover rounded-lg border-[1.5px] border-outline" />
          <button
            type="button"
            onClick={() => onPick(null)}
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
  );
}

/**
 * Mic toggle anchored inside a text field. Streams finalized speech into the
 * field via onAppend; pulses while listening. Self-hides where the browser has
 * no Web Speech API (e.g. Firefox), so the field just stays type-only there.
 */
function MicButton({ onAppend }: { onAppend: (text: string) => void }) {
  const { supported, listening, error, toggle } = useSpeechRecognition({ onResult: onAppend });
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={listening ? "Stop voice input" : "Start voice input"}
      title={error ?? (listening ? "Listening… tap to stop" : "Tap to talk")}
      className={`absolute bottom-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
        listening
          ? "bg-orange text-white animate-pulse"
          : "bg-tile border border-outline text-ink-2 hover:text-ink-1"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
      </svg>
    </button>
  );
}
