import { saveAction, type SaveRequest } from "@/lib/admin/saveAction";

// The ops task PATCH, as a saveAction request. TaskListView is the worked
// example of saveAction (lib/admin/saveAction.ts): it passes this request
// plus a rollback, and saveAction checks the response and toasts.
export function taskPatchRequest(id: string, fields: Record<string, unknown>): SaveRequest {
  return { url: `/api/admin/ops/tasks/${id}`, method: "PATCH", body: fields };
}

// The raw PATCH, for a batch that a single saveAction checks as a whole
// (TaskListView's reorder hands saveAction the first failed response).
export function sendTaskPatch(id: string, fields: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const req = taskPatchRequest(id, fields) as Exclude<SaveRequest, () => Promise<Response>>;
  return fetchImpl(req.url, {
    method: req.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  });
}

// PATCH one ops task and report the outcome: null when the save landed,
// otherwise the sentence to show. Never throws. Kept for callers that show
// the error themselves; it is saveAction with the toast turned off.
// Plain module (no "use client") so tests can drive it with a fake fetch.
export async function patchTask(
  id: string,
  fields: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const r = await saveAction({ request: taskPatchRequest(id, fields), failure: false, fetchImpl });
  return r.ok ? null : r.message;
}
