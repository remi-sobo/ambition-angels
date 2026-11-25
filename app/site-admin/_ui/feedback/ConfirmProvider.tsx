"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import Modal from "@/app/site-admin/_ui/ui/Modal";
import Button from "@/app/site-admin/_ui/ui/Button";

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
      {/* The kit Modal (focus trap, Escape and scrim cancel, phone sheet),
          stacked above any drawer the confirm was raised from. */}
      <Modal
        open={!!pending}
        onClose={() => settle(false)}
        title={pending?.title ?? ""}
        description={pending?.body}
        size="sm"
        layer="top"
        footer={
          <>
            <Button variant="secondary" size="sm" data-autofocus onClick={() => settle(false)}>
              Cancel
            </Button>
            <Button variant={pending?.destructive ? "danger" : "primary"} size="sm" onClick={() => settle(true)}>
              {pending?.confirmLabel}
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </ConfirmContext.Provider>
  );
}
