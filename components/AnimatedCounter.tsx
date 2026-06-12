"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  /** Display value, e.g. "3,500+", "87%", "14%", "1,100+". */
  value: string;
  /** Animation duration in ms. */
  duration?: number;
};

/**
 * Counts up to `value` when scrolled into view. Inherits all typography from
 * the parent element, so it can drop into any stat treatment. Renders the
 * final value immediately for users who prefer reduced motion.
 */
export default function AnimatedCounter({ value, duration = 1600 }: Props) {
  const match = value.match(/^([^\d]*)([\d,]+)(.*)$/);
  const prefix = match?.[1] ?? "";
  const numTarget = match ? parseInt(match[2].replace(/,/g, ""), 10) : NaN;
  const suffix = match?.[3] ?? "";
  const hasComma = (match?.[2] ?? "").includes(",");

  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || Number.isNaN(numTarget)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setStarted(true);
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [numTarget]);

  useEffect(() => {
    if (!started || Number.isNaN(numTarget)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(numTarget);
      return;
    }
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * numTarget));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [started, numTarget, duration]);

  if (Number.isNaN(numTarget)) return <span>{value}</span>;

  const display = hasComma ? count.toLocaleString("en-US") : count.toString();
  return (
    <span ref={ref} aria-label={value}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
