"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useCurrentEntity } from "../RailEntityContext";
import { useReed } from "./ReedProvider";
import type { ReedContext } from "./contract";

/**
 * The Reed panel slot. Blooms up from the dock into the espresso surface — the
 * one high-emphasis lane, summoned. Reed's real conversation UI renders behind
 * this interface (see contract.ts); until that build lands, the body is an inert
 * warming-up state. The chrome (header, context chip, escalated draft) is real
 * so the contract and the bloom can be reviewed now.
 */
export default function ReedPanel({ onReport }: { onReport: () => void }) {
  const { open, draft, ready, dismiss } = useReed();
  const entity = useCurrentEntity();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  // The assembled contract handed to Reed.
  const context: ReedContext = {
    page: pathname ?? "",
    entity: entity ? { type: entity.type, id: entity.id, label: entity.label } : null,
    draft,
  };

  return (
    <div className="hidden xl:flex fixed right-0 bottom-0 z-40 w-[336px] h-[62%] flex-col rounded-t-card bg-navy text-cream shadow-[0_-8px_28px_rgba(35,22,13,0.28)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2 flex-shrink-0">
        <span className="inline-flex items-center gap-1.5 text-sm font-heading font-semibold">
          <Sparkle /> Reed
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onReport}
            className="text-[11px] text-cream/55 hover:text-cream transition-colors px-1.5 py-1"
          >
            Report an issue
          </button>
          <button
            onClick={dismiss}
            aria-label="Close Reed"
            className="text-cream/55 hover:text-cream transition-colors p-1"
          >
            <Close />
          </button>
        </div>
      </div>

      {context.entity && (
        <div className="px-4 pb-2 flex-shrink-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-navy-light px-2 py-0.5 text-[11px] text-cream/70">
            <span aria-hidden>↳</span>
            <span className="truncate max-w-[240px]">on: {context.entity.label}</span>
          </span>
        </div>
      )}

      {/* Body — REED INTEGRATION SEAM. When `ready`, the external build mounts
          its conversation here (contract.ts ReedMount); until then, inert. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-3">
        {context.draft && (
          <div className="flex justify-end">
            <div className="bg-navy-light rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13px] leading-relaxed max-w-[85%]">
              {context.draft}
            </div>
          </div>
        )}
        <div className="flex items-start gap-2">
          <Sparkle className="mt-0.5 opacity-40 flex-shrink-0" />
          <p className="text-[13px] leading-relaxed text-cream/70">
            {ready
              ? "Ask me anything about what you're looking at."
              : "Reed is warming up — your assistant is connecting. Your note is safe here."}
          </p>
        </div>
      </div>

      {/* Input — inert until Reed is wired. */}
      <div className="px-3 pb-3 pt-1.5 flex-shrink-0">
        <div className="flex items-center gap-2 rounded-xl bg-navy-light px-3 py-2.5">
          <input
            disabled={!ready}
            placeholder={ready ? "Ask Reed or keep typing…" : "Reed isn’t connected yet"}
            aria-label="Message Reed"
            className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-cream placeholder-cream/40 disabled:cursor-not-allowed"
          />
          <button
            disabled={!ready}
            aria-label="Send to Reed"
            className="flex-shrink-0 w-7 h-7 rounded-lg bg-orange text-white flex items-center justify-center disabled:opacity-40 transition-opacity"
          >
            <SendArrow />
          </button>
        </div>
      </div>
    </div>
  );
}

function Sparkle({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2z" />
    </svg>
  );
}

function Close() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SendArrow() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}
