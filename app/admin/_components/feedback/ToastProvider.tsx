"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

// Quality Floor Q2 — the toast layer that replaces alert() (the audit's F2:
// 141 native dialogs, 90+ of them showing raw HTTP codes). Non-blocking,
// house-styled, announced to screen readers; errors persist longer than
// successes; everything is dismissible. Q3 migrates the call sites; nothing
// else in the app is allowed to call alert() once it lands.

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider> (the admin layout mounts it)");
  return ctx;
}

const KIND_STYLE: Record<ToastKind, string> = {
  success: "border-revenue/40 bg-revenue-bg text-revenue",
  error: "border-expense/40 bg-expense-bg text-expense",
  info: "border-outline bg-surface text-ink-1",
};

// Errors linger (the person needs to read what to do); successes confirm
// and get out of the way.
const DISMISS_MS: Record<ToastKind, number> = { success: 4000, info: 5000, error: 8000 };

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind) => (message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, kind, message }]); // never a wall of toasts
      window.setTimeout(() => dismiss(id), DISMISS_MS[kind]);
    },
    [dismiss],
  );

  // Stable API object per provider instance.
  const apiRef = useRef<ToastApi | null>(null);
  if (!apiRef.current) {
    apiRef.current = { success: push("success"), error: push("error"), info: push("info") };
  }

  return (
    <ToastContext.Provider value={apiRef.current}>
      {children}
      {/* Above the mobile bar (bottom-20) on phones, corner on desktop. */}
      <div
        aria-live="polite"
        role="status"
        className="fixed z-[70] bottom-20 lg:bottom-6 right-4 left-4 lg:left-auto lg:w-96 space-y-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-card border-[1.5px] shadow-panel px-4 py-3 text-sm leading-snug ${KIND_STYLE[t.kind]}`}
          >
            <span className="flex-1 min-w-0">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 -mr-1 px-1 opacity-60 hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
