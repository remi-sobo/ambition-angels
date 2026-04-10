"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    Givebutter?: (action: string, ...args: unknown[]) => void;
  }
}

const WIDGET_ID = "LWq3rp";

/**
 * Invisible mount — keeps the <givebutter-widget> element in the DOM
 * so GiveButter's script can find it on init.
 */
export default function GiveButterWidget() {
  useEffect(() => {
    // If GiveButter already loaded, trigger a silent open/close to force init.
    if (typeof window !== "undefined" && window.Givebutter) {
      try {
        window.Givebutter("widget.open", WIDGET_ID);
        window.Givebutter("widget.close", WIDGET_ID);
      } catch {
        // ignore
      }
    }
  }, []);

  return <givebutter-widget id={WIDGET_ID} />;
}

/**
 * Call from any onClick to open the GiveButter donate popup.
 */
export function openDonateWidget() {
  if (typeof window !== "undefined" && window.Givebutter) {
    window.Givebutter("widget.open", WIDGET_ID);
  }
}
