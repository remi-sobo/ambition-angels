/**
 * V4 Stage C: the one read a gift card needs. A gift card is never filed by
 * Capture (lib/capture/cardKind.ts): the person records the money in the gift
 * drawer, through /api/admin/gifts and its own checks. Afterwards the card is
 * marked filed with that gift's id, and this verifies the id is a real gift
 * in the caller's org that the caller can read (session client, RLS plus an
 * explicit org fence). Read only: nothing here writes money.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type LinkedGift = { id: string; constituent_id: string | null; amount: number };

export async function findGift(supabase: SupabaseClient, orgId: string, giftId: string): Promise<LinkedGift | null> {
  const { data } = await supabase
    .from("gifts")
    .select("id, constituent_id, amount")
    .eq("id", giftId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return null;
  const row = data as { id: string; constituent_id: string | null; amount: number | string };
  return { id: row.id, constituent_id: row.constituent_id, amount: Number(row.amount) };
}
