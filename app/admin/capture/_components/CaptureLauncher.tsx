"use client";

import { useEffect, useState } from "react";
import CaptureModal from "./CaptureModal";
import { CAPTURE_OPEN_EVENT } from "../_lib/openCapture";
import type { CaptureContext } from "../_lib/captureApi";

/**
 * The one desktop Capture modal (V4 §8). Mounted once by the admin layout,
 * only for orgs with ai.capture; opened by openCapture() from the sidebar's
 * Talk to log button, Today's primary action, or a record page. Phones open
 * Capture from the centre of the bottom bar (V2MobileBar), which mounts its
 * own sheet.
 */
export default function CaptureLauncher({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState<{ context: CaptureContext | null } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ context?: CaptureContext | null }>).detail;
      setOpen({ context: detail?.context ?? null });
    };
    window.addEventListener(CAPTURE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CAPTURE_OPEN_EVENT, onOpen);
  }, [enabled]);

  if (!enabled || !open) return null;
  return (
    <CaptureModal
      surface={open.context ? "entity_page" : "quick_add"}
      context={open.context}
      onClose={() => setOpen(null)}
    />
  );
}
