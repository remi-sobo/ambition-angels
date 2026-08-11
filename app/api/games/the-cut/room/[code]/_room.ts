import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeClaimCode, ROOM_CODE_LENGTH } from "@/lib/ms/claim";
import type { RoomState } from "@/lib/games/the-cut";

// Shared loader for the per-room routes: normalize the code the way every
// other room surface does, fetch, and expire in one place.

export type CutRoomRow = {
  id: string;
  room_code: string;
  host_token: string;
  state: RoomState;
  expires_at: string;
};

export async function loadRoom(
  code: string
): Promise<{ room: CutRoomRow; expired: boolean } | null> {
  const normalized = normalizeClaimCode(code);
  if (normalized.length !== ROOM_CODE_LENGTH) return null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("cut_rooms")
    .select("id, room_code, host_token, state, expires_at")
    .eq("room_code", normalized)
    .maybeSingle();
  if (!data) return null;
  return {
    room: data as CutRoomRow,
    expired: new Date(data.expires_at).getTime() < Date.now(),
  };
}

export const isVoterId = (v: unknown): v is string =>
  typeof v === "string" && v.length >= 8 && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v);
