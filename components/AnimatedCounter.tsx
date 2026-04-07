"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  target: string; // e.g. "3500", "87", "36"
  prefix?: string; // e.g. ""
  suffix?: string; // e.g. "+", "%"
  duration?: number; // ms, default 1800
  label: string;
};

export default function AnimatedCounter({ target, prefix = "", suffix = "", duration = 1800, label }: Props) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const numTarget = parseInt(target.replace(/,/g, ""), 10);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;

    // Respect prefers-reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(numTarget);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * numTarget));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [started, numTarget, duration]);

  const display = count >= 1000 ? count.toLocaleString() : count.toString();

  return (
    <div ref={ref} className="text-center">
      <div className="font-heading font-bold text-4xl lg:text-5xl text-orange mb-1">
        {prefix}{display}{suffix}
      </div>
      <div className="text-gray-mid text-sm">{label}</div>
    </div>
  );
}
