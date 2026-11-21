import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { campaignStoryBlock } from "./story-gate";

/**
 * The send-path form of the consent gate, for callers on the SESSION client
 * (the queue, the preview, the test send).
 *
 * Why the service role: story_subjects RLS hides participant rows from a
 * caller without comms.subjects.read (staff). Asked through a staff member's
 * session, a story about a participant would look like a story about nobody,
 * and "nobody to protect" publishes on approval alone. The gate has to see
 * every subject to refuse correctly, so it reads with the service role,
 * pinned to the org the caller's own session resolved. It returns only a
 * sentence; nothing identifying leaves this function.
 */
export function campaignStoryBlockForOrg(orgId: string, campaignId: string): Promise<string | null> {
  return campaignStoryBlock(getSupabaseAdmin(), orgId, campaignId);
}
