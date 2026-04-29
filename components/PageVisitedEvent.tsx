"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

interface Props {
  name: string;
}

/**
 * Fires a single named click_event when the host page mounts. Used to
 * surface visits to high-value pages (e.g. /companies, /program-partners)
 * in the Key Events table — which is otherwise click-only.
 *
 * Pages still get standard pageview tracking via <Analytics />; this is
 * an additional explicit event that admins can sort by.
 */
export default function PageVisitedEvent({ name }: Props) {
  useEffect(() => {
    trackEvent(name);
  }, [name]);
  return null;
}
