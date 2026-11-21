import type { SupabaseClient } from "@supabase/supabase-js";
import { closeAckTaskForGift } from "@/lib/fundraising/ack-tasks";

// Mark one gift thanked without sending anything: the same atomic claim,
// task close and acknowledgment row as POST /api/admin/acknowledgments/mark,
// shared with the bulk "Mark thanked" on Fundraising → Thank-yous (V4 B1).
// It never sends an email.

export type MarkResult = "marked" | "already" | "failed";

export async function markGiftThanked(
  supabase: SupabaseClient,
  opts: { orgId: string; giftId: string; channel: string; note?: string | null; user: string | null },
): Promise<{ result: MarkResult; warning?: string }> {
  const sentAt = new Date().toISOString();
  const { data: claimed, error } = await supabase
    .from("gifts")
    .update({ acknowledgment_status: "sent", acknowledged_at: sentAt })
    .eq("id", opts.giftId)
    .eq("org_id", opts.orgId)
    .neq("acknowledgment_status", "sent")
    .select("id");
  if (error) return { result: "failed" };
  if (!claimed || claimed.length === 0) return { result: "already" };

  const ackTaskId = await closeAckTaskForGift(supabase, opts.giftId);
  const { error: ackErr } = await supabase.from("acknowledgments").insert({
    org_id: opts.orgId,
    gift_id: opts.giftId,
    subject_type: "gift",
    subject_id: opts.giftId,
    ops_task_id: ackTaskId,
    template: "manual",
    channel: opts.channel,
    body: opts.note ? opts.note.slice(0, 500) : null,
    sent_by: opts.user,
    sent_at: sentAt,
  });
  return ackErr
    ? { result: "marked", warning: "Marked as thanked, but the acknowledgment record could not be stored." }
    : { result: "marked" };
}
