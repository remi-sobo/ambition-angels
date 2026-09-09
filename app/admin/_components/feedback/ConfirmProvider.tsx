"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

// Quality Floor Q2 — the dialog that replaced the native browser confirm
// (the audit's F2: 54 of them gating actions, permanent ones included). The
// interruption is KEPT — that's the audit's own "what I would not change" —
// but the moment gets what it deserves: the consequence stated in the body
// and the confirming VERB on the button, never "OK". Promise-based, so Q3's
// migration was mechanical: a blocking if-not gate became
// `if (!(await confirm({ ... })))`.

export type ConfirmOptions = {
  title: string;
  /** The consequence, stated plainly ("They become permanent and can no
   *  longer be edited."). */
  body?: string;
  /** The confirming verb ("Approve minutes", "Delete draft") — never "OK". */
  confirmLabel: string;
  /** Destructive styling on the confirm button. */
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider> (the admin layout mounts it)");
  return ctx;
}

export default function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const p = { ...opts, resolve };
      pendingRef.current = p;
      setPending(p);
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    pendingRef.current?.resolve(ok);
    pendingRef.current = null;
    setPending(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={pending.title}
          onKeyDown={(e) => {
            if (e.key === "Escape") settle(false);
          }}
        >
          {/* Scrim: clicking away is a cancel, same as Escape. */}
          <div className="absolute inset-0 bg-ink/50" onClick={() => settle(false)} />
          <div className="relative w-full max-w-md rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-6">
            <h2 className={TYPE.cardTitle}>{pending.title}</h2>
            {pending.body && (
              <p className="mt-2 text-sm text-ink-2 leading-relaxed">{pending.body}</p>
            )}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => settle(false)}
                className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                className={`text-xs font-semibold text-white rounded-full px-4 py-2 transition-colors ${
                  pending.destructive
                    ? "bg-expense hover:bg-expense/85"
                    : "bg-orange hover:bg-orange-dark"
                }`}
              >
                {pending.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
