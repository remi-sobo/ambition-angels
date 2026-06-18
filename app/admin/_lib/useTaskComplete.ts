"use client";

import { useCallback, useState } from "react";

// Drives the "complete → strike → collapse away" animation for checklist rows.
// Marking something done plays the animation (via the `.task-leaving` class in
// globals.css) and then runs `commit` — the PATCH + refresh — so the row lands
// in the completed/archived view as it disappears from the open list. Marking
// something NOT done should bypass this and commit immediately.
const LEAVE_MS = 450; // keep in sync with the taskLeave keyframe duration

export function useTaskComplete() {
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  const isLeaving = useCallback((id: string) => leaving.has(id), [leaving]);

  const complete = useCallback((id: string, commit: () => void | Promise<void>) => {
    setLeaving((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      void commit();
    }, LEAVE_MS);
  }, []);

  return { isLeaving, complete };
}
