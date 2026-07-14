import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { newRoomCode } from "@/lib/ms/claim";

// Open a room (Phase 5). The facilitator is an adult: their email is where
// every deck in the room lands at the end. The response carries host_token —
// the facilitator's screen keeps it, because the room code itself is on the
// wall and cannot gate anything.
export async function POST(req: NextRequest) {
  const rl = rateLimit(`ms-room:${getClientIp(req)}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body.host_email === "string" ? body.host_email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return NextResponse.json({ error: "That doesn't look like an email address" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  for (let attempt = 0; attempt < 3; attempt++) {
    const roomCode = newRoomCode();
    const { data, error } = await supabase
      .from("ms_rooms")
      .insert({ room_code: roomCode, host_email: email })
      .select("id, room_code, host_token, expires_at")
      .single();
    if (!error && data) {
      return NextResponse.json({
        roomCode: data.room_code,
        hostToken: data.host_token,
        expiresAt: data.expires_at,
      });
    }
    if (error && error.code !== "23505") {
      console.error("ms room: create failed:", error);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
