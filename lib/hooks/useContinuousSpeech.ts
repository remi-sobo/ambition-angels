"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { initialSpeechState, shouldRestart, speechReducer, type SpeechState } from "./continuousSpeech";

/**
 * Continuous dictation for Capture (specs/bloomos-capture.md, ruling 14).
 *
 * The existing useSpeechRecognition hook (ReportModal) stops for good when the
 * browser ends a session on silence and drops interim words; a 2 to 4 minute
 * voice note needs neither. This hook keeps ONE recognizer per mount, restarts
 * it from onend while the person still wants to record, accumulates the
 * transcript across restarts, flushes interim words on stop, ticks a timer,
 * and auto-stops at SPEECH_CAP_SECONDS. All transitions are in
 * ./continuousSpeech (pure, unit-tested); this file only wires the browser.
 *
 * Restart and start decisions read a ref, never React state, so a restart from
 * onend can't act on a stale closure (recon section 1, item 8).
 */

type ResultLike = { 0: { transcript: string }; isFinal: boolean };
type EventLike = { resultIndex: number; results: { length: number; [i: number]: ResultLike } };
type RecognizerLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: EventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognizerCtor = new () => RecognizerLike;

function getCtor(): RecognizerCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Safari throws InvalidStateError if start() follows onend too closely. */
const RESTART_DELAY_MS = 250;

export type ContinuousSpeech = SpeechState & {
  supported: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
};

export function useContinuousSpeech(): ContinuousSpeech {
  const [state, dispatch] = useReducer(speechReducer, initialSpeechState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const recRef = useRef<RecognizerLike | null>(null);
  // Known only in the browser; false during SSR and the first paint.
  const [supported, setSupported] = useState(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const Ctor = getCtor();
    setSupported(!!Ctor);
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) dispatch({ type: "final", text });
        else interim += text;
      }
      dispatch({ type: "interim", text: interim });
    };
    rec.onerror = (ev) => dispatch({ type: "error", code: ev?.error ?? "unknown" });
    rec.onend = () => {
      dispatch({ type: "ended" });
      if (!shouldRestart(stateRef.current)) return;
      restartTimer.current = setTimeout(() => {
        if (!shouldRestart(stateRef.current)) return;
        try {
          rec.start();
        } catch {
          /* already running */
        }
      }, RESTART_DELAY_MS);
    };
    recRef.current = rec;

    return () => {
      if (restartTimer.current) clearTimeout(restartTimer.current);
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* no-op */
      }
      recRef.current = null;
    };
  }, []);

  // One-second timer while recording; the reducer applies the cap.
  useEffect(() => {
    if (state.phase !== "recording") return;
    const id = setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => clearInterval(id);
  }, [state.phase]);

  // Leaving "recording" for any reason (stop, cap, error) stops the recognizer.
  useEffect(() => {
    if (state.phase === "recording") return;
    if (restartTimer.current) clearTimeout(restartTimer.current);
    try {
      recRef.current?.stop();
    } catch {
      /* no-op */
    }
  }, [state.phase]);

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec || stateRef.current.phase === "recording") return;
    dispatch({ type: "start" });
    try {
      rec.start(); // must run inside the tap's gesture on iOS
    } catch {
      /* already started */
    }
  }, []);

  const stop = useCallback(() => dispatch({ type: "stop" }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return { ...state, supported, start, stop, reset };
}
