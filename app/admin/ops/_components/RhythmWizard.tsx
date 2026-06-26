"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";

/**
 * The shared stepper for the weekly rhythm (Operating Rhythm v2). One shell,
 * driven by a `mode` config — Monday "Plan" and Friday "Close" pass the same
 * shape, different steps. Altitude, not navigation: the chrome (title, the step
 * rail, the footer) persists; only the body changes as you move through the
 * ritual. The active step lives in the URL (?step=) so a refresh — including the
 * router.refresh() every task action fires — keeps you in place, and a step is
 * linkable.
 *
 * Step content is rendered on the server and handed in as `content`, so each
 * step keeps its server data fetch and its own client islands (task rows, the
 * planner) without the wizard knowing anything about them.
 */

export type WizardStep = { key: string; label: string; content: ReactNode };

export default function RhythmWizard({
  eyebrow,
  title,
  subtitle,
  steps,
}: {
  /** e.g. "Monday · Aim" / "Friday · Account". */
  eyebrow: string;
  /** "Plan" / "Close". */
  title: string;
  subtitle?: ReactNode;
  steps: WizardStep[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const fromUrl = steps.findIndex((s) => s.key === sp.get("step"));
  const [index, setIndex] = useState(fromUrl === -1 ? 0 : fromUrl);
  const clamped = Math.min(Math.max(index, 0), steps.length - 1);

  function go(i: number) {
    const next = Math.min(Math.max(i, 0), steps.length - 1);
    setIndex(next);
    router.replace(`${pathname}?step=${steps[next].key}`, { scroll: false });
  }

  const step = steps[clamped];
  const atFirst = clamped === 0;
  const atLast = clamped === steps.length - 1;

  return (
    <div className="max-w-6xl px-4 lg:px-8 py-6 lg:py-8">
      {/* ── Chrome: title + back to hub ─────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] font-semibold text-orange-dark">
            {eyebrow}
          </div>
          <h1 className="mt-1 font-display font-black uppercase tracking-tight text-ink-1 text-3xl sm:text-4xl leading-none">
            {title}
          </h1>
          {subtitle && (
            <div className="mt-2 text-sm text-ink-2 flex items-baseline gap-2 flex-wrap">
              {subtitle}
            </div>
          )}
        </div>
        <Link
          href="/admin/ops/my-week"
          className="shrink-0 text-xs text-ink-2 hover:text-ink-1 mt-1"
        >
          ← My Week
        </Link>
      </header>

      {/* ── Step rail ───────────────────────────────────────────────────── */}
      <nav
        aria-label="Ritual steps"
        className="mt-5 flex items-center gap-1.5 overflow-x-auto pb-1"
      >
        {steps.map((s, i) => {
          const active = i === clamped;
          const done = i < clamped;
          return (
            <button
              key={s.key}
              onClick={() => go(i)}
              className={[
                "shrink-0 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors border",
                active
                  ? "bg-orange-light text-orange-dark border-orange/40"
                  : done
                  ? "bg-surface text-ink-2 border-outline hover:bg-[#EFE6D4]"
                  : "bg-surface text-ink-3 border-outline hover:bg-[#EFE6D4]",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold",
                  active
                    ? "bg-orange text-white"
                    : done
                    ? "bg-revenue-bg text-revenue"
                    : "bg-tile text-ink-2",
                ].join(" ")}
              >
                {done ? (
                  <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="whitespace-nowrap">{s.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="mt-5">{step.content}</div>

      {/* ── Footer nav ──────────────────────────────────────────────────── */}
      <div className="mt-6 flex items-center justify-between border-t border-hairline pt-4">
        <button
          onClick={() => go(clamped - 1)}
          disabled={atFirst}
          className="text-sm font-medium px-3 py-2 rounded-lg text-ink-2 hover:text-ink-1 hover:bg-[#EFE6D4] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
        >
          ← Back
        </button>
        <span className="text-xs text-ink-3">
          Step {clamped + 1} of {steps.length} · {step.label}
        </span>
        {atLast ? (
          <Link
            href="/admin/ops/my-week"
            className="text-sm font-medium px-4 py-2 rounded-lg bg-orange/15 text-orange border border-orange/30 hover:bg-orange/25 transition-colors"
          >
            Done →
          </Link>
        ) : (
          <button
            onClick={() => go(clamped + 1)}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-orange/15 text-orange border border-orange/30 hover:bg-orange/25 transition-colors"
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
