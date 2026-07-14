"use client";

// The wizard (Phase 2): one item per screen, tap-only, no free text ever.
// The body face is set larger than an adult site would set it because these
// screens get read in noisy rooms. Nothing flashes, nothing buzzes.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ITEMS, SCALE, QUESTION } from "@/lib/ms/instrument";

export default function AssessClient({ roomCode = null }: { roomCode?: string | null }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const index = answers.length;
  const item = index < ITEMS.length ? ITEMS[index] : null;
  const progress = useMemo(() => (index / ITEMS.length) * 100, [index]);

  const submit = useCallback(
    async (finalAnswers: number[]) => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/ms/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: finalAnswers,
            ...(roomCode ? { room_code: roomCode } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(
            res.status === 409
              ? "The game isn't quite ready yet. Come back soon."
              : "Something went wrong. Tap to try again."
          );
          setSubmitting(false);
          return;
        }
        router.replace(`/ms/results/${data.sessionId}`);
      } catch {
        setError("Something went wrong. Tap to try again.");
        setSubmitting(false);
      }
    },
    [router, roomCode]
  );

  const tap = useCallback(
    (score: number) => {
      if (submitting) return;
      const next = [...answers, score];
      setAnswers(next);
      if (next.length === ITEMS.length) void submit(next);
    },
    [answers, submitting, submit]
  );

  const back = useCallback(() => {
    if (submitting || answers.length === 0) return;
    setAnswers((prev) => prev.slice(0, -1));
  }, [answers.length, submitting]);

  return (
    <div className="min-h-screen bg-ink text-cream flex flex-col">
      {/* Hairline progress. It fills; it never rushes anybody. */}
      <div className="h-[3px] bg-cream/10">
        <div
          className="h-full bg-orange motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between px-5 py-4">
        <button
          onClick={back}
          disabled={answers.length === 0 || submitting}
          className={`font-body text-sm text-cream/50 hover:text-cream transition-colors ${
            answers.length === 0 ? "invisible" : ""
          }`}
        >
          &larr; Back
        </button>
        <span className="font-heading text-xs tracking-[0.2em] text-cream/40 tabular-nums">
          {Math.min(index + 1, ITEMS.length)} / {ITEMS.length}
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-center px-6 pb-12 max-w-xl mx-auto w-full">
        {submitting || !item ? (
          <div className="text-center">
            <p className="font-display text-4xl sm:text-5xl leading-tight">
              Working out what you&rsquo;re built for
            </p>
            {error && (
              <button
                onClick={() => submit(answers)}
                className="font-body text-orange mt-6 underline underline-offset-4"
              >
                {error}
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="font-heading text-[11px] tracking-[0.25em] uppercase text-cream/40 mb-4">
              {QUESTION}
            </p>
            <h1 className="font-body text-2xl sm:text-3xl leading-snug min-h-[7rem]">{item.text}</h1>
            <div className="mt-8 flex flex-col gap-2.5">
              {SCALE.map((label, score) => (
                <button
                  key={label}
                  onClick={() => tap(score)}
                  className="w-full text-left font-body text-lg px-6 py-4 rounded-2xl border border-cream/15 hover:border-orange hover:bg-orange/10 active:bg-orange/20 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
