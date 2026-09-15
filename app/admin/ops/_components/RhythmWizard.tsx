"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";
import Stepper from "../../_components/ui/Stepper";
import Button, { ButtonLink } from "../../_components/ui/Button";

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
    // Preserve the rest of the query when writing ?step= — on Plan & Close
    // (Spec Work W1) ?ritual= rides the URL, and dropping it would flip the
    // screen back to the time default mid-ritual. No-op on the V1 routes,
    // which carry no other params.
    const q = new URLSearchParams(sp);
    q.set("step", steps[next].key);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  const step = steps[clamped];
  const atFirst = clamped === 0;
  const atLast = clamped === steps.length - 1;

  return (
    <div className="max-w-workspace px-4 lg:px-8 py-6 lg:py-8">
      {/* ── Chrome: title + back to hub ─────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className={`${TYPE.sectionHeader} mb-1.5`}>{eyebrow}</div>
          <h1 className={TYPE.pageTitle}>{title}</h1>
          {subtitle && (
            <div className="mt-2 text-sm text-ink-2 flex items-baseline gap-2 flex-wrap">
              {subtitle}
            </div>
          )}
        </div>
        <ButtonLink href="/admin/ops/my-week" variant="ghost" size="sm" className="shrink-0">
          ← My Week
        </ButtonLink>
      </header>

      {/* ── Level 3: workflow progress (Visual System V3 §6) ───────────────
          The five steps used to render as five more capsules — the third row
          of pills on a screen that already had two, reading as yet another
          navigation bar rather than as progress. They are now a proper
          horizontal stepper: numbered nodes joined by a connector, the title
          under each number, terracotta for active, a success check for done,
          neutral ahead. On mobile it becomes a vertical progression.  */}
      <Stepper
        className="mt-8"
        label="Ritual steps"
        steps={steps.map((s) => ({ key: s.key, label: s.label }))}
        current={clamped}
        onStep={go}
      />

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="mt-8">{step.content}</div>

      {/* ── Footer nav ──────────────────────────────────────────────────── */}
      <div className="mt-8 flex items-center justify-between gap-4 border-t border-hairline pt-4">
        <Button variant="ghost" onClick={() => go(clamped - 1)} disabled={atFirst}>
          ← Back
        </Button>
        <span className={`${TYPE.metadata} text-center`}>
          Step {clamped + 1} of {steps.length} · {step.label}
        </span>
        {/* Advancing the ritual IS the action on this screen, so it takes the
            one primary button (V3 §4) instead of the tinted outline both
            controls used to share. */}
        {atLast ? (
          <ButtonLink href="/admin/ops/my-week" variant="primary">
            Done →
          </ButtonLink>
        ) : (
          <Button onClick={() => go(clamped + 1)}>Next →</Button>
        )}
      </div>
    </div>
  );
}
