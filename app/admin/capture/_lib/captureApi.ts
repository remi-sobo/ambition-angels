/**
 * Client calls for Capture (C4). Only /api/admin/capture/** is reachable from
 * here (tests/capture-ui-fence.test.ts): the UI never talks to a destination.
 * Errors come back as plain words the screen can show as is.
 */

import { userMessage } from "@/lib/admin/errors";
import type { CandidateView, CaptureView, CardView, ConfirmAllResult } from "./cardView";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; body: Record<string, unknown> };

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    return { ok: false, status: 0, error: "You look offline. Your words are still here; try again when you're connected.", body: {} };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: body as T };
  const server = typeof body.error === "string" && body.error.trim() ? body.error : null;
  return { ok: false, status: res.status, error: server ?? userMessage(res, body as never), body };
}

export type Surface = "mobile_plus" | "quick_add" | "entity_page" | "paste";

/** The record a capture was started from (C5): a strong prior for the matcher. */
export type CaptureContext = { type: "constituent" | "partner" | "opportunity"; id: string; name: string };

export function parseCapture(input: {
  transcript: string;
  source_surface: Surface;
  duration_seconds?: number | null;
  capture_id?: string | null;
  context_type?: CaptureContext["type"] | null;
  context_id?: string | null;
}) {
  return call<{ capture_id: string; status: string; youth_skipped: number }>("/api/admin/capture", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getCapture(id: string) {
  return call<{ capture: CaptureView; cards: CardView[] }>(`/api/admin/capture/${id}`);
}

export function cardAction(id: string, action: "confirm" | "discard" | "undo" | "edit", patch?: Record<string, unknown>) {
  return call<{ card: CardView; applied?: { table: string; id: string } }>(`/api/admin/capture/cards/${id}`, {
    method: "POST",
    body: JSON.stringify(patch ? { action, patch } : { action }),
  });
}

export function confirmAllCards(captureId: string) {
  return call<ConfirmAllResult & { capture_status: string | null }>(`/api/admin/capture/${captureId}/confirm-all`, {
    method: "POST",
  });
}

export function searchCandidates(q: string, kind?: "constituent" | "partner") {
  const qs = new URLSearchParams({ q });
  if (kind) qs.set("kind", kind);
  return call<{ candidates: CandidateView[] }>(`/api/admin/capture/candidates?${qs.toString()}`);
}

/** Plain words for a parse failure, by status. */
export function parseFailureMessage(status: number, body: Record<string, unknown>, fallback: string): string {
  if (status === 429 && body.rate_limited) return "That's a lot of recordings this hour. Try again in a bit, or type it into a task.";
  if (status === 429 && body.capped) return "This org has hit its AI budget for the month. Type it into a task for now.";
  if (status === 503) return "Capture isn't set up on this server yet. Tell Remi.";
  if (status === 402) return "Capture isn't turned on for this org.";
  if (status === 502) return "I couldn't sort that into cards. Your words are saved; try again.";
  return fallback;
}
