import { getActionQueue } from "@/lib/admin/actionQueue";
import { getAdminUser } from "@/lib/admin/auth";
import NeedsYouQueueClient from "./NeedsYouQueueClient";

// Operating Spine — the "Needs You" queue (spec #1, Phase 3): one ranked,
// cross-department list of every open item that needs a human, read from
// v_action_items (org-scoped + permission-filtered by RLS under
// security_invoker), deep-linked through the entity registry. Rendering and
// interaction (mine-toggle, one-click completion) live in the client
// component; this server shell just loads and hands off.
export default async function NeedsYouQueue() {
  let items;
  try {
    items = await getActionQueue();
  } catch {
    return null; // never let the queue break the Command Center
  }
  const me = (await getAdminUser()) ?? null;
  return <NeedsYouQueueClient items={items} me={me} />;
}
