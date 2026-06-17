import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyUnsubscribe } from "@/lib/fundraising/unsubscribe";

// Public one-click unsubscribe (CAN-SPAM). Signed token gates it; on success
// the constituent is flagged do_not_contact, which suppresses them from every
// future send (resolveRecipients excludes do-not-contact).
export const dynamic = "force-dynamic";

function page(message: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head>
     <body style="font-family:sans-serif;background:#FAFAF8;color:#0E0E0E;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;">
       <div style="max-width:420px;text-align:center;padding:32px;">
         <h1 style="font-size:20px;color:#E8500A;">Ambition Angels</h1>
         <p style="color:#3D3D3D;font-size:15px;line-height:1.6;">${message}</p>
       </div>
     </body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest) {
  const c = req.nextUrl.searchParams.get("c") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(c) || !verifyUnsubscribe(c, t)) {
    return page("This unsubscribe link is invalid or has expired. Email remi@ambitionangels.org and we'll take care of it.");
  }
  try {
    await getSupabaseAdmin().from("constituents").update({ do_not_contact: true }).eq("id", c);
  } catch {
    return page("Something went wrong. Please email remi@ambitionangels.org to unsubscribe.");
  }
  return page("You've been unsubscribed. You won't receive further emails from us. Changed your mind? Just reply to any past email.");
}
