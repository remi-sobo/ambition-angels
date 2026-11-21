import { userMessage, networkMessage } from "@/lib/admin/errors";

// PATCH one ops task and report the outcome for the list view: null when
// the save landed, otherwise the sentence to show in the error toast. Never
// throws, so a caller can roll its optimistic change back on any failure.
// Plain module (no "use client") so tests can drive it with a fake fetch.
export async function patchTask(
  id: string,
  fields: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/admin/ops/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
  } catch {
    return networkMessage();
  }
  if (res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return userMessage(res, body);
}
