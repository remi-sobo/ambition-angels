"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * The current entity the user is looking at — the single source of truth for
 * "what am I looking at" that drives the capture auto-link chip (and, in Phase 3,
 * Reed's context contract). Only the two types ops_tasks.linked_entity supports
 * are representable; everything else falls back to unlinked rather than guess.
 */
export type CurrentEntity = {
  type: "partner" | "constituent";
  id: string;
  label: string;
};

type Ctx = {
  entity: CurrentEntity | null;
  setEntity: (e: CurrentEntity | null) => void;
};

const RailEntityCtx = createContext<Ctx | null>(null);

export function RailEntityProvider({ children }: { children: ReactNode }) {
  const [entity, setEntity] = useState<CurrentEntity | null>(null);
  // Provider renders no DOM node, so it can wrap the body + rail without
  // disturbing the layout's flex row.
  return <RailEntityCtx.Provider value={{ entity, setEntity }}>{children}</RailEntityCtx.Provider>;
}

/** Read the current entity. Null when not on an entity page (capture unlinked). */
export function useCurrentEntity(): CurrentEntity | null {
  return useContext(RailEntityCtx)?.entity ?? null;
}

/**
 * Publisher: an entity detail page renders this to register the entity it's
 * showing. Renders nothing. Clears on unmount so leaving the page drops the
 * link back to unlinked — a stale chip would mislink a task (failure mode #2).
 */
export function RailEntity({ type, id, label }: CurrentEntity) {
  const setEntity = useContext(RailEntityCtx)?.setEntity;
  useEffect(() => {
    if (!setEntity) return;
    setEntity({ type, id, label });
    return () => setEntity(null);
  }, [setEntity, type, id, label]);
  return null;
}
