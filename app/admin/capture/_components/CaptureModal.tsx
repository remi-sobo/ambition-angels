"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TYPE } from "@/lib/admin/typeScale";
import { MAX_TRANSCRIPT_CHARS } from "@/lib/capture/constants";
import { SPEECH_CAP_SECONDS, formatElapsed } from "@/lib/hooks/continuousSpeech";
import { useContinuousSpeech } from "@/lib/hooks/useContinuousSpeech";
import { useConfirm } from "../../_components/feedback/ConfirmProvider";
import { parseCapture, parseFailureMessage, type CaptureContext, type Surface } from "../_lib/captureApi";
import { useFocusTrap } from "../_lib/useFocusTrap";
import ConfirmStack from "./ConfirmStack";

/**
 * Record (specs/bloomos-capture.md, C4): talk or type, then confirm cards.
 *
 * mode     what the person sees
 * -------  ----------------------------------------------------------------
 * record   timer, live transcript, Stop. Stop sends it straight to the parse.
 * type     a textarea (also the fallback when the browser has no speech API)
 * working  "Sorting it out" with step labels, never a blank spinner
 * denied   mic blocked: how to turn it back on, or type instead
 * failed   speech or parse failed: the words are kept; retry or type
 * cards    "Here's what I heard"
 *
 * Nothing writes to a real record until a card's Confirm. Once a parse has
 * succeeded the capture is saved server-side, so closing never loses it: it
 * resumes at /admin/capture/<id>.
 */

type Mode = "record" | "type" | "working" | "denied" | "failed" | "cards";

const STEPS = ["Reading what you said", "Matching names to your records", "Drafting cards"];

export default function CaptureModal({
  surface,
  context = null,
  onClose,
}: {
  surface: Exclude<Surface, "paste">;
  /** The record this was started from (entity pages, C5). */
  context?: CaptureContext | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const speech = useContinuousSpeech();
  const [mode, setMode] = useState<Mode>("record");
  const [typed, setTyped] = useState("");
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ message: string; words: string; viaSpeech: boolean; speech?: boolean } | null>(null);
  const [step, setStep] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);

  // Browsers without the speech API go straight to typing.
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setChecked(true), 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (checked && !speech.supported && mode === "record") setMode("type");
  }, [checked, speech.supported, mode]);

  // Lock the page behind the sheet (iOS rubber-banding).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Step labels advance while the parse runs.
  useEffect(() => {
    if (mode !== "working") return;
    setStep(0);
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2500);
    return () => clearInterval(id);
  }, [mode]);

  const submit = useCallback(
    async (words: string, viaSpeech: boolean) => {
      const transcript = words.trim();
      if (!transcript) {
        setFailure({ message: "I didn't catch anything. Try again, or type it.", words: "", viaSpeech });
        setMode("failed");
        return;
      }
      setMode("working");
      const r = await parseCapture({
        transcript: transcript.slice(0, MAX_TRANSCRIPT_CHARS),
        // Typed notes are 'paste' unless they started on a record's page,
        // where the context is the more useful fact.
        source_surface: viaSpeech || context ? surface : "paste",
        context_type: context?.type ?? null,
        context_id: context?.id ?? null,
        duration_seconds: viaSpeech ? speech.elapsed : null,
        capture_id: captureId,
      });
      if (r.ok) {
        setCaptureId(r.data.capture_id);
        setMode("cards");
        return;
      }
      const id = typeof r.body.capture_id === "string" ? r.body.capture_id : null;
      if (id) setCaptureId(id);
      setFailure({ message: parseFailureMessage(r.status, r.body, r.error), words: transcript, viaSpeech });
      setMode("failed");
    },
    [captureId, speech.elapsed, surface, context],
  );

  // Stop (or the 4-minute cap) sends the note straight to the parse.
  const sentRef = useRef(false);
  useEffect(() => {
    if (mode !== "record" || speech.phase !== "stopped" || sentRef.current) return;
    sentRef.current = true;
    void submit(speech.transcript, true);
  }, [mode, speech.phase, speech.transcript, submit]);

  useEffect(() => {
    if (mode !== "record") return;
    if (speech.phase === "denied") setMode("denied");
    if (speech.phase === "failed") {
      setFailure({ message: speech.error ?? "Speech recognition stopped working.", words: speech.transcript, viaSpeech: true, speech: true });
      setMode("failed");
    }
  }, [mode, speech.phase, speech.error, speech.transcript]);

  const close = useCallback(async () => {
    const unsent = mode === "record" && speech.phase === "recording" ? speech.transcript : mode === "type" ? typed : "";
    if (unsent.trim()) {
      const ok = await confirm({
        title: "Discard what you said?",
        body: "It hasn't been sorted into cards yet, so closing now loses it.",
        confirmLabel: "Discard",
        destructive: true,
      });
      if (!ok) return;
    }
    speech.reset();
    if (captureId) router.refresh();
    onClose();
  }, [mode, speech, typed, confirm, captureId, router, onClose]);

  // Escape closes (with the same guard). Inner sheets stop their own Escape.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mode !== "working") void close();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [close, mode]);

  const typeInstead = (words: string) => {
    if (speech.phase === "recording") speech.stop();
    sentRef.current = true; // typing takes over; don't auto-send the recording
    setTyped(words);
    setMode("type");
  };

  const retrySpeech = () => {
    sentRef.current = false;
    speech.reset();
    setFailure(null);
    setMode("record");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:px-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Record"
        className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl border-hairline bg-ink shadow-2xl sm:max-w-lg sm:rounded-panel"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3">
          <span className={TYPE.sectionHeader}>Record</span>
          <button
            type="button"
            onClick={() => void close()}
            disabled={mode === "working"}
            className={`${TYPE.button} min-h-[52px] px-2 text-ink-2 hover:text-ink-1 disabled:opacity-40`}
          >
            {mode === "cards" && allDone ? "Done" : mode === "cards" ? "Finish later" : "Cancel"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {context && mode !== "cards" && mode !== "working" && (
            <p className={`${TYPE.metadata} mb-4 rounded-control border border-hairline bg-tile px-3 py-2`}>
              About <span className="font-semibold text-ink-1">{context.name}</span>. You don&apos;t have to say the name.
            </p>
          )}
          {mode === "record" && <RecordPane speech={speech} onTypeInstead={() => typeInstead(speech.transcript)} />}

          {mode === "type" && (
            <TypePane
              value={typed}
              onChange={setTyped}
              unsupported={checked && !speech.supported}
              onSubmit={() => void submit(typed, false)}
            />
          )}

          {mode === "working" && (
            <div className="py-10 text-center" role="status" aria-live="polite">
              <h2 className={TYPE.modalTitle}>Sorting it out</h2>
              <ol className="mx-auto mt-5 max-w-xs space-y-2 text-left">
                {STEPS.map((label, i) => (
                  <li key={label} className={`flex items-center gap-2 text-sm ${i <= step ? "text-ink-1" : "text-ink-3"}`}>
                    <span
                      aria-hidden
                      className={`h-2 w-2 shrink-0 rounded-full ${i < step ? "bg-revenue" : i === step ? "bg-orange motion-safe:animate-pulse" : "bg-ink-3 opacity-40"}`}
                    />
                    {label}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {mode === "denied" && (
            <div className="space-y-4 py-4">
              <h2 className={TYPE.modalTitle}>The microphone is blocked</h2>
              <p className={TYPE.bodyMuted}>BloomOS needs the mic to hear you. To turn it back on:</p>
              <ul className={`${TYPE.body} list-disc space-y-1.5 pl-5`}>
                <li>iPhone, installed app: Settings, then Safari, then Microphone, set to Allow. Then reopen BloomOS.</li>
                <li>iPhone, in Safari: tap the page settings in the address bar, then Microphone, then Allow.</li>
                <li>Chrome: tap the lock or settings icon in the address bar and allow the microphone.</li>
              </ul>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => typeInstead(speech.transcript)}
                  className={`${TYPE.button} min-h-[52px] rounded-control bg-orange px-5 text-white hover:bg-orange-dark`}
                >
                  Type instead
                </button>
                <button
                  type="button"
                  onClick={retrySpeech}
                  className={`${TYPE.button} min-h-[52px] rounded-control border border-hairline px-5 text-ink-1 hover:bg-tile`}
                >
                  Try the mic again
                </button>
              </div>
            </div>
          )}

          {mode === "failed" && failure && (
            <div className="space-y-4 py-4">
              <h2 className={TYPE.modalTitle}>That didn&apos;t work</h2>
              <p className={TYPE.body}>{failure.message}</p>
              {failure.words && (
                <p className={`${TYPE.bodyMuted} max-h-40 overflow-y-auto whitespace-pre-wrap rounded-control border border-hairline bg-tile p-3`}>
                  {failure.words}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {failure.words && (
                  <button
                    type="button"
                    onClick={() => void submit(failure.words, failure.viaSpeech)}
                    className={`${TYPE.button} min-h-[52px] rounded-control bg-orange px-5 text-white hover:bg-orange-dark`}
                  >
                    {failure.speech ? "Sort out what I heard" : "Try again"}
                  </button>
                )}
                {(failure.speech || !failure.words) && (
                  <button
                    type="button"
                    onClick={retrySpeech}
                    className={`${TYPE.button} min-h-[52px] rounded-control px-5 ${
                      failure.words ? "border border-hairline text-ink-1 hover:bg-tile" : "bg-orange text-white hover:bg-orange-dark"
                    }`}
                  >
                    Record again
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => typeInstead(failure.words)}
                  className={`${TYPE.button} min-h-[52px] rounded-control border border-hairline px-5 text-ink-1 hover:bg-tile`}
                >
                  {failure.words ? "Edit as text" : "Type instead"}
                </button>
              </div>
            </div>
          )}

          {mode === "cards" && captureId && (
            <ConfirmStack captureId={captureId} onAllDone={() => setAllDone(true)} />
          )}
        </div>
      </div>
    </div>
  );
}

function RecordPane({
  speech,
  onTypeInstead,
}: {
  speech: ReturnType<typeof useContinuousSpeech>;
  onTypeInstead: () => void;
}) {
  const recording = speech.phase === "recording";
  const idle = speech.phase === "idle";
  const left = SPEECH_CAP_SECONDS - speech.elapsed;

  return (
    <div className="flex flex-col items-center py-2 text-center">
      {idle ? (
        <>
          <h2 className={TYPE.modalTitle}>Say it once</h2>
          <p className={`${TYPE.bodyMuted} mt-1 max-w-xs`}>
            Who you talked to, what happened, what needs doing. You&apos;ll check every card before anything is filed.
          </p>
          <button
            type="button"
            data-autofocus
            onClick={speech.start}
            aria-label="Start recording"
            className="mt-6 flex h-24 w-24 items-center justify-center rounded-full bg-orange text-white shadow-xl shadow-orange/30 transition-transform hover:bg-orange-dark active:scale-95"
          >
            <MicIcon />
          </button>
          <p className={`${TYPE.metadata} mt-3`}>Tap to start talking</p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2" aria-live="off">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${recording ? "bg-expense motion-safe:animate-pulse" : "bg-ink-3"}`} />
            <span className={`${TYPE.cardTitle} tabular-nums`}>{formatElapsed(speech.elapsed)}</span>
            {left <= 30 && recording && <span className={TYPE.metadata}>{left}s left</span>}
          </div>
          <div
            className="mt-4 min-h-[8rem] w-full max-h-[40vh] overflow-y-auto rounded-control border border-hairline bg-tile p-3 text-left"
            aria-live="polite"
          >
            {speech.transcript || speech.interim ? (
              <p className={TYPE.body}>
                {speech.transcript}
                {speech.interim && <span className="text-ink-3"> {speech.interim}</span>}
              </p>
            ) : (
              <p className={TYPE.bodyMuted}>Listening…</p>
            )}
          </div>
          <button
            type="button"
            data-autofocus
            onClick={speech.stop}
            disabled={!recording}
            className={`${TYPE.button} mt-5 min-h-[52px] w-full rounded-control bg-orange px-5 text-white transition-colors hover:bg-orange-dark disabled:opacity-50`}
          >
            {recording ? "Stop and sort it out" : "Sending…"}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={onTypeInstead}
        className={`${TYPE.button} mt-3 min-h-[52px] px-3 text-ink-2 hover:text-ink-1`}
      >
        Type instead
      </button>
    </div>
  );
}

function TypePane({
  value,
  onChange,
  unsupported,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  unsupported: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className={TYPE.modalTitle}>Type or paste it</h2>
      <p className={TYPE.bodyMuted}>
        {unsupported
          ? "Voice isn't available in this browser, so type or paste your note. It goes through the same steps."
          : "Write it the way you'd say it. You'll check every card before anything is filed."}
      </p>
      <textarea
        data-autofocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={7}
        maxLength={MAX_TRANSCRIPT_CHARS}
        placeholder="Had coffee with Maria Chen. She wants the impact numbers before November. Have Shannon send the one-pager by Friday."
        className="w-full rounded-control border-hairline bg-tile px-3 py-2.5 text-base text-ink-1 placeholder-ink-3 focus:border-orange/50 focus:outline-none sm:text-sm"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={!value.trim()}
        className={`${TYPE.button} min-h-[52px] w-full rounded-control bg-orange px-5 text-white transition-colors hover:bg-orange-dark disabled:opacity-50`}
      >
        Sort it out
      </button>
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
