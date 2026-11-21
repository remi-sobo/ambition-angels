/**
 * V4 §8: one way to open Talk to log from anywhere on desktop. The shell
 * mounts one <CaptureLauncher> (behind ai.capture); the sidebar button, the
 * Today header and entity pages dispatch this event instead of mounting their
 * own modal, the same pattern global search uses.
 */
import type { CaptureContext } from "./captureApi";

export const CAPTURE_OPEN_EVENT = "bloomos:capture:open";

export function openCapture(context: CaptureContext | null = null) {
  window.dispatchEvent(new CustomEvent(CAPTURE_OPEN_EVENT, { detail: { context } }));
}
