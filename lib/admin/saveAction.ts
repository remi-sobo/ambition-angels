import { userMessage, networkMessage } from "@/lib/admin/errors";

/**
 * saveAction: the one client helper for a BloomOS mutation (spec §12: "Add
 * one saveAction helper that checks the response, rolls back optimistic
 * changes, and toasts with userMessage()").
 *
 *   const r = await saveAction({
 *     request: { url: `/api/admin/ops/tasks/${id}`, method: "PATCH", body: { status: "done" } },
 *     optimistic: () => setDone(true),     // runs before the request
 *     rollback: () => setDone(false),      // runs on ANY failure
 *     success: "Task done",                // optional success toast
 *     toast,                               // from useToast(); or use useSaveAction()
 *   });
 *   if (r.ok) router.refresh();
 *
 * What it does, in order:
 *  1. runs `optimistic` (if given)
 *  2. sends the request (a descriptor, or a function returning a Response)
 *  3. reads the JSON body and treats as failure: a thrown fetch (network),
 *     a non-2xx status, or a 2xx carrying the app's error shape
 *     (`{ ok: false }` or `{ error: "..." }` with no `ok: true`)
 *  4. on failure: calls `rollback`, shows the standard error toast with the
 *     userMessage() sentence (never a status code), returns { ok: false }
 *  5. on success: shows the optional success toast, returns { ok: true, data }
 *
 * It NEVER throws to the caller: every path resolves to a SaveResult, so a
 * forgotten try/catch cannot leave the screen showing a change that did not
 * save.
 *
 * MONEY RULE: never pass `optimistic` for a write that moves or records money
 * (gifts, pledges, transactions, budgets, payouts). Show the saving state,
 * wait for the server, then update. A rollback after a person has seen
 * "$25,000 recorded" is worse than a one-second wait. Use optimistic only
 * where a rollback is harmless (a task tick, a reorder, a pin).
 *
 * Plain module (no "use client"): tests drive it with a fake fetch and toast.
 */

export type SaveRequest =
  | {
      url: string;
      method?: "POST" | "PATCH" | "PUT" | "DELETE";
      /** Serialized as JSON. */
      body?: unknown;
      headers?: Record<string, string>;
    }
  | (() => Promise<Response>);

export type SaveResult<T> =
  | { ok: true; data: T; status: number }
  | {
      ok: false;
      /** The sentence that was (or would be) shown to the person. */
      message: string;
      /** HTTP status, or null when the request never got a response. */
      status: number | null;
      kind: "network" | "http" | "app";
    };

/** The slice of useToast() this helper needs. */
export type SaveToast = { success: (message: string) => void; error: (message: string) => void };

export type SaveActionOptions<T> = {
  request: SaveRequest;
  /** Apply the change on screen before the server answers. Never for money. */
  optimistic?: () => void;
  /** Undo the optimistic change. Called on every failure. */
  rollback?: () => void;
  /** Success toast text (or a function of the response data). Omit for none. */
  success?: string | ((data: T) => string);
  /**
   * Failure toast: omit for the standard userMessage() sentence, a string or
   * function to replace it, or `false` when the caller shows the error
   * inline instead (rollback still runs).
   */
  failure?: false | string | ((message: string) => string);
  toast?: SaveToast;
  fetchImpl?: typeof fetch;
};

function isAppError(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const b = body as Record<string, unknown>;
  if (b.ok === false) return true;
  return b.ok !== true && typeof b.error === "string" && b.error.trim() !== "";
}

function safely(fn: (() => void) | undefined) {
  if (!fn) return;
  try {
    fn();
  } catch (e) {
    console.error("saveAction callback failed:", e);
  }
}

export async function saveAction<T = unknown>(opts: SaveActionOptions<T>): Promise<SaveResult<T>> {
  const { request, optimistic, rollback, success, failure, toast, fetchImpl = fetch } = opts;

  const fail = (message: string, status: number | null, kind: "network" | "http" | "app"): SaveResult<T> => {
    safely(rollback);
    if (failure !== false && toast) {
      const shown = typeof failure === "string" ? failure : typeof failure === "function" ? failure(message) : message;
      safely(() => toast.error(shown));
    }
    return { ok: false, message, status, kind };
  };

  safely(optimistic);

  let res: Response;
  try {
    res =
      typeof request === "function"
        ? await request()
        : await fetchImpl(request.url, {
            method: request.method ?? "POST",
            headers: { "Content-Type": "application/json", ...(request.headers ?? {}) },
            body: request.body === undefined ? undefined : JSON.stringify(request.body),
          });
  } catch (e) {
    console.error("saveAction request failed:", e);
    return fail(networkMessage(), null, "network");
  }

  // A 204, an empty body or non-JSON reads as {}: success is decided by the
  // status and the app's error shape, not by having a body.
  const text = await res.text().catch(() => "");
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = {};
    }
  }

  if (!res.ok) {
    return fail(userMessage(res, body as { error?: unknown }), res.status, "http");
  }
  if (isAppError(body)) {
    return fail(userMessage(res, body as { error?: unknown }), res.status, "app");
  }

  const data = body as T;
  if (success && toast) {
    safely(() => toast.success(typeof success === "function" ? success(data) : success));
  }
  return { ok: true, data, status: res.status };
}
