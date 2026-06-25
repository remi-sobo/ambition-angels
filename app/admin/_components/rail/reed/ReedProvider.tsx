"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Reed summon state, shared across the rail so the anchored "Ask Reed" pill, the
 * collapsed-state launcher, and the panel all agree. `ready` is false until the
 * external Reed build wires a real mount — while false the panel shows its inert
 * warming-up state instead of a conversation.
 */
type ReedState = {
  open: boolean;
  draft: string;
  ready: boolean;
  summon: (draft?: string) => void;
  dismiss: () => void;
};

const FALLBACK: ReedState = {
  open: false,
  draft: "",
  ready: false,
  summon: () => {},
  dismiss: () => {},
};

const ReedCtx = createContext<ReedState | null>(null);

export function ReedProvider({
  ready = false,
  children,
}: {
  ready?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const summon = useCallback((d?: string) => {
    setDraft(d ?? "");
    setOpen(true);
  }, []);
  const dismiss = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, draft, ready, summon, dismiss }),
    [open, draft, ready, summon, dismiss]
  );
  return <ReedCtx.Provider value={value}>{children}</ReedCtx.Provider>;
}

/** Safe outside a provider (returns inert state) so the slot never crashes. */
export function useReed(): ReedState {
  return useContext(ReedCtx) ?? FALLBACK;
}
