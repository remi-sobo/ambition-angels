"use client";

import { useEffect } from "react";
import CareerQuiz from "@/components/CareerQuiz";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal wrapper around the career quiz — used on the homepage and
 * /curriculum, where an adult may be taking it on a teen's behalf, so the
 * audience picker stays on. Teens get the same quiz as a full page at
 * /teens/career-quiz.
 */
export default function CareerQuizModal({ isOpen, onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (isOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full lg:max-w-2xl max-h-[92vh] lg:max-h-[88vh] bg-cream rounded-t-3xl lg:rounded-3xl overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-light flex-shrink-0 bg-cream">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-orange uppercase tracking-widest">
              Career Discovery
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-warm hover:text-ink transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <CareerQuiz source="modal" />
        </div>
      </div>
    </div>
  );
}
