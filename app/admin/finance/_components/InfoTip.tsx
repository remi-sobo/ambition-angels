"use client";

import { useRef, useState } from "react";

// Read-only "?" marker that explains where a finance number comes from. Hover
// or focus (or tap on touch) to see a one-line definition, the source, and the
// formula. Positioned `fixed` from the trigger's rect so it's never clipped by a
// card's overflow-hidden, and clamped to the viewport so it can't run off-screen.
//
// Content is passed as children — keep it short: what the number is, what feeds
// it, and the equation. Use <b> for the formula terms and <code> for fields.
export default function InfoTip({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 300,
  });
  const btnRef = useRef<HTMLButtonElement>(null);

  const show = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const width = Math.min(300, window.innerWidth - 16);
      let left = r.left;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
      if (left < 8) left = 8;
      setPos({ top: r.bottom + 6, left, width });
    }
    setOpen(true);
  };
  const hide = () => setOpen(false);

  return (
    <span className="relative inline-flex align-middle">
      <button
        ref={btnRef}
        type="button"
        aria-label={`How is ${heading} calculated?`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.preventDefault();
          if (open) hide();
          else show();
        }}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-outline text-[9px] font-bold leading-none text-ink-2 hover:text-ink-1 hover:border-ink-2 cursor-help transition-colors"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
          className="z-50 rounded-card border-[1.5px] border-outline bg-surface shadow-panel p-3 text-left pointer-events-none normal-case tracking-normal"
        >
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-1 mb-1">
            {heading}
          </span>
          <span className="block text-[11px] font-normal text-ink-2 leading-relaxed [&_b]:text-ink-1 [&_b]:font-semibold [&_code]:text-ink-1 [&_code]:font-mono">
            {children}
          </span>
        </span>
      )}
    </span>
  );
}
