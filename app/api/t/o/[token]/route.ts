import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isTrackingToken } from "@/lib/comms/links";

// Open pixel (specs/comms-v2-gmail-amendment.md G3). Public: the random
// per-send token is the only key. Always answers with the same 1x1 GIF, so it
// reveals nothing about whether a token exists. Stores no reader data.
export const dynamic = "force-dynamic";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (isTrackingToken(params.token)) {
    const { error } = await getSupabaseAdmin().rpc("record_email_open", { p_token: params.token });
    if (error) console.error("[track/open] failed:", error.message);
  }
  return new Response(GIF, {
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, no-cache, must-revalidate, private",
    },
  });
}
