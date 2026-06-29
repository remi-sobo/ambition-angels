"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Thin wrapper over the browser-native Web Speech API (SpeechRecognition).
 *
 * Built for the BloomOS in-app debugging reporter: Shannon or Remi tap a mic and
 * just talk, and the transcript streams into whatever field they're filling. No
 * server round-trip, no audio upload, works offline-ish in the installed PWA on
 * Chrome / Safari. Browsers without the API (e.g. Firefox) report
 * `supported: false` so callers can hide the mic button.
 *
 * Usage: pass an `onResult(text)` that receives each *finalized* chunk of
 * speech; append it to your input. `interim` exposes the live, not-yet-final
 * words so the UI can show them greyed-out while the person is mid-sentence.
 */

// Minimal typings — the Web Speech API isn't in the TS DOM lib yet.
type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition({
  onResult,
}: {
  onResult: (finalChunk: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Keep the latest callback without re-creating the recognizer each render.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const chunk = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += chunk;
        else interimText += chunk;
      }
      if (finalText) {
        onResultRef.current(finalText);
        setInterim("");
      } else {
        setInterim(interimText);
      }
    };
    rec.onerror = (ev) => {
      // "no-speech" / "aborted" are routine; surface only the actionable ones.
      const code = ev?.error ?? "";
      if (code === "not-allowed" || code === "service-not-allowed") {
        setError("Microphone access was blocked. Allow it in your browser settings.");
      } else if (code && code !== "no-speech" && code !== "aborted") {
        setError("Voice input hit a snag. Try again.");
      }
      setListening(false);
      setInterim("");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;

    return () => {
      try {
        rec.abort();
      } catch {
        /* no-op */
      }
      recRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec || listening) return;
    setError(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      // start() throws if called while already started — ignore.
    }
  }, [listening]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* no-op */
    }
    setListening(false);
    setInterim("");
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, interim, error, start, stop, toggle };
}
