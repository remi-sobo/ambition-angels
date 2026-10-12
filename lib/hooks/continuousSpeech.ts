/**
 * The pure half of useContinuousSpeech (specs/bloomos-capture.md, ruling 14;
 * docs/recon/capture-phase0.md section 1). Every transition the recorder can
 * make lives here as a reducer so it can be unit-tested without a browser.
 *
 * Browsers end a recognition session on their own after a silence window
 * (and Safari can ignore `continuous` entirely). While the person is still on
 * the record screen we restart, and the words already heard are never lost:
 * `transcript` only ever grows until `reset`.
 */

export const SPEECH_CAP_SECONDS = 4 * 60;

export type SpeechPhase =
  | "idle" // not started, or reset
  | "recording" // the person wants to be listening (the recognizer may be mid-restart)
  | "stopped" // the person tapped Stop, or the cap was hit
  | "denied" // microphone permission refused
  | "failed"; // speech service error (network, audio-capture, ...)

export type SpeechState = {
  phase: SpeechPhase;
  /** Every finalized chunk, joined. Survives restarts. */
  transcript: string;
  /** Words heard but not yet final. Shown grey; flushed into transcript on stop. */
  interim: string;
  /** Seconds recorded so far (driven by `tick`). */
  elapsed: number;
  /** How many times the recognizer has been restarted after the browser ended it. */
  restarts: number;
  /** True when the cap, not the person, ended the recording. */
  capped: boolean;
  /** Interim words flushed on stop; a trailing final repeating them is dropped. */
  flushed: string;
  error: string | null;
};

export type SpeechAction =
  | { type: "start" }
  | { type: "final"; text: string }
  | { type: "interim"; text: string }
  /** The browser ended the session (onend). */
  | { type: "ended" }
  | { type: "error"; code: string }
  | { type: "tick"; seconds?: number }
  | { type: "stop" }
  | { type: "reset" };

export const initialSpeechState: SpeechState = {
  phase: "idle",
  transcript: "",
  interim: "",
  elapsed: 0,
  restarts: 0,
  capped: false,
  flushed: "",
  error: null,
};

/** Join a new chunk onto the transcript with sane spacing; capitalize the very first word. */
export function joinChunk(transcript: string, chunk: string): string {
  const clean = chunk.replace(/\s+/g, " ").trim();
  if (!clean) return transcript;
  if (!transcript) return clean.charAt(0).toUpperCase() + clean.slice(1);
  return `${transcript.replace(/\s+$/, "")} ${clean}`;
}

/** Error codes that are routine pauses, not failures: keep listening. */
export const RESTART_CODES = new Set(["no-speech", "aborted"]);
const DENIED_CODES = new Set(["not-allowed", "service-not-allowed"]);

export function errorMessage(code: string): string {
  if (DENIED_CODES.has(code)) return "Microphone access is blocked.";
  if (code === "network") return "Speech recognition lost its connection.";
  if (code === "audio-capture") return "No microphone was found.";
  return "Speech recognition stopped working.";
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

function finish(state: SpeechState, capped: boolean): SpeechState {
  return {
    ...state,
    phase: "stopped",
    transcript: joinChunk(state.transcript, state.interim),
    interim: "",
    flushed: norm(state.interim),
    capped,
  };
}

export function speechReducer(state: SpeechState, action: SpeechAction): SpeechState {
  switch (action.type) {
    case "start":
      // Starting again after a stop keeps what was said; reset clears it.
      return { ...state, phase: "recording", error: null, capped: false, flushed: "" };
    case "final":
      if (state.phase !== "recording" && state.phase !== "stopped") return state;
      // After stop the browser often finalizes the very words we already
      // flushed from interim. Drop that echo instead of doubling it.
      if (state.phase === "stopped" && state.flushed && norm(action.text) === state.flushed) {
        return { ...state, flushed: "" };
      }
      return { ...state, transcript: joinChunk(state.transcript, action.text), interim: "" };
    case "interim":
      if (state.phase !== "recording") return state;
      return { ...state, interim: action.text };
    case "ended":
      // While recording, the hook restarts; fold any interim in so a word the
      // browser never finalized before its silence cut-off isn't lost.
      if (state.phase !== "recording") return state;
      return {
        ...state,
        transcript: joinChunk(state.transcript, state.interim),
        interim: "",
        restarts: state.restarts + 1,
      };
    case "error":
      if (RESTART_CODES.has(action.code)) return state;
      if (DENIED_CODES.has(action.code)) {
        return { ...finish(state, false), phase: "denied", error: errorMessage(action.code) };
      }
      return { ...finish(state, false), phase: "failed", error: errorMessage(action.code) };
    case "tick": {
      if (state.phase !== "recording") return state;
      const elapsed = state.elapsed + (action.seconds ?? 1);
      if (elapsed >= SPEECH_CAP_SECONDS) return { ...finish(state, true), elapsed: SPEECH_CAP_SECONDS };
      return { ...state, elapsed };
    }
    case "stop":
      if (state.phase !== "recording") return state;
      return finish(state, false);
    case "reset":
      return initialSpeechState;
    default:
      return state;
  }
}

/** Should the hook restart the recognizer after the browser ended it? */
export function shouldRestart(state: SpeechState): boolean {
  return state.phase === "recording";
}

/** "1:07" */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
