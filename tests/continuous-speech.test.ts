import { describe, expect, test } from "vitest";
import {
  SPEECH_CAP_SECONDS,
  formatElapsed,
  initialSpeechState,
  joinChunk,
  shouldRestart,
  speechReducer,
  type SpeechAction,
  type SpeechState,
} from "@/lib/hooks/continuousSpeech";

// Capture C4 step 1: the recorder's transitions (ruling 14, recon section 1).

const run = (actions: SpeechAction[], from: SpeechState = initialSpeechState) => actions.reduce(speechReducer, from);

describe("continuous speech reducer", () => {
  test("accumulates final chunks across browser restarts", () => {
    const s = run([
      { type: "start" },
      { type: "final", text: "had coffee with maria chen" },
      { type: "ended" },
      { type: "final", text: "she wants the impact numbers" },
      { type: "ended" },
      { type: "final", text: "  before november " },
    ]);
    expect(s.transcript).toBe("Had coffee with maria chen she wants the impact numbers before november");
    expect(s.restarts).toBe(2);
    expect(s.phase).toBe("recording");
    expect(shouldRestart(s)).toBe(true);
  });

  test("a silence end folds unfinished words in instead of losing them", () => {
    const s = run([{ type: "start" }, { type: "final", text: "call shannon" }, { type: "interim", text: "about friday" }, { type: "ended" }]);
    expect(s.transcript).toBe("Call shannon about friday");
    expect(s.interim).toBe("");
  });

  test("stop flushes interim words into the transcript", () => {
    const s = run([{ type: "start" }, { type: "final", text: "send the one pager" }, { type: "interim", text: "by friday" }, { type: "stop" }]);
    expect(s.phase).toBe("stopped");
    expect(s.transcript).toBe("Send the one pager by friday");
    expect(shouldRestart(s)).toBe(false);
  });

  test("a trailing final that repeats the flushed words is not doubled", () => {
    const s = run([{ type: "start" }, { type: "interim", text: "by Friday" }, { type: "stop" }, { type: "final", text: "by Friday." }]);
    expect(s.transcript).toBe("By Friday");
  });

  test("a trailing final after stop still lands", () => {
    const s = run([{ type: "start" }, { type: "stop" }, { type: "final", text: "last words" }]);
    expect(s.transcript).toBe("Last words");
  });

  test("no-speech and aborted are pauses, not failures", () => {
    const s = run([{ type: "start" }, { type: "error", code: "no-speech" }, { type: "error", code: "aborted" }]);
    expect(s.phase).toBe("recording");
    expect(s.error).toBeNull();
  });

  test("not-allowed is the mic-denied state and keeps what was said", () => {
    const s = run([{ type: "start" }, { type: "final", text: "hello" }, { type: "error", code: "not-allowed" }]);
    expect(s.phase).toBe("denied");
    expect(s.error).toMatch(/blocked/);
    expect(s.transcript).toBe("Hello");
    expect(shouldRestart(s)).toBe(false);
  });

  test("network and audio-capture are the failed state", () => {
    expect(run([{ type: "start" }, { type: "error", code: "network" }]).phase).toBe("failed");
    expect(run([{ type: "start" }, { type: "error", code: "audio-capture" }]).error).toMatch(/microphone/);
  });

  test("the timer ticks only while recording, and the cap auto-stops", () => {
    let s = run([{ type: "start" }, { type: "tick" }, { type: "tick" }]);
    expect(s.elapsed).toBe(2);
    s = run([{ type: "interim", text: "almost done" }, { type: "tick", seconds: SPEECH_CAP_SECONDS }], s);
    expect(s.phase).toBe("stopped");
    expect(s.capped).toBe(true);
    expect(s.elapsed).toBe(SPEECH_CAP_SECONDS);
    expect(s.transcript).toBe("Almost done");
    expect(run([{ type: "tick" }], s).elapsed).toBe(SPEECH_CAP_SECONDS);
  });

  test("start after stop keeps the words; reset clears them", () => {
    const stopped = run([{ type: "start" }, { type: "final", text: "first part" }, { type: "stop" }]);
    const resumed = run([{ type: "start" }, { type: "final", text: "second part" }], stopped);
    expect(resumed.transcript).toBe("First part second part");
    expect(run([{ type: "reset" }], resumed)).toEqual(initialSpeechState);
  });

  test("interim is ignored outside recording", () => {
    expect(run([{ type: "interim", text: "ghost" }]).interim).toBe("");
  });
});

describe("helpers", () => {
  test("joinChunk spacing and first-word capital", () => {
    expect(joinChunk("", "  hi  there ")).toBe("Hi there");
    expect(joinChunk("Hi", "")).toBe("Hi");
    expect(joinChunk("Hi ", "there")).toBe("Hi there");
  });

  test("formatElapsed", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(67)).toBe("1:07");
    expect(formatElapsed(240)).toBe("4:00");
  });
});
