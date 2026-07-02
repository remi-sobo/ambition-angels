"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import ReedPanel from "./ReedPanel";

/**
 * One shared launcher for the real Reed drawer. Both the "Ask Reed" FAB (mobile)
 * and the right rail's capture-to-Reed escalation (desktop) open the same panel
 * through this provider, so there's a single Reed UI regardless of entry point.
 *
 * `enabled` mirrors the `ai.reed` entitlement (resolved server-side in the
 * layout). When false, open() is a no-op and the panel never mounts — the real
 * boundary is /api/reed/ask's server-side check; this just hides the affordance.
 */
type OpenOpts = {
  draft?: string;
  contextRef?: Record<string, unknown> | null;
  surface?: string;
};

type ReedLauncher = {
  enabled: boolean;
  open: (opts?: OpenOpts) => void;
  close: () => void;
};

const FALLBACK: ReedLauncher = { enabled: false, open: () => {}, close: () => {} };

const ReedLauncherCtx = createContext<ReedLauncher | null>(null);

export function ReedLauncherProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<OpenOpts>({});
  const router = useRouter();

  const doOpen = useCallback(
    (o?: OpenOpts) => {
      if (!enabled) return;
      setOpts(o ?? {});
      setOpen(true);
    },
    [enabled]
  );
  // Refresh on close so anything the conversation persisted (the Q&A history on
  // /admin/reed, new drafts/suggestions) shows up without a manual reload.
  const close = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  const value = useMemo<ReedLauncher>(
    () => ({ enabled, open: doOpen, close }),
    [enabled, doOpen, close]
  );

  return (
    <ReedLauncherCtx.Provider value={value}>
      {children}
      {enabled && open && (
        <ReedPanel
          onClose={close}
          initialDraft={opts.draft ?? ""}
          contextRef={opts.contextRef ?? null}
          surface={opts.surface ?? "fab"}
        />
      )}
    </ReedLauncherCtx.Provider>
  );
}

/** Safe outside a provider (inert) so any surface can call it unconditionally. */
export function useReedLauncher(): ReedLauncher {
  return useContext(ReedLauncherCtx) ?? FALLBACK;
}
