import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyUnsubscribe } from "@/lib/fundraising/unsubscribe";

// Public one-click unsubscribe (CAN-SPAM / RFC 8058). Signed token gates it;
// on success every known email for the constituent is upserted into
// email_suppressions (reason 'unsubscribed', attributed to the campaign in
// the c= param when present). do_not_contact is deliberately untouched — it
// stays the human, all-channel CRM flag; suppression is email-only.
//
// GET serves the footer link; POST serves List-Unsubscribe-Post one-click
// (mail clients POST with no body semantics we rely on — same token check).
export const dynamic = "force-dynamic";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

function page(message: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head>
     <body style="font-family:sans-serif;background:#FAFAF8;color:#0E0E0E;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;">
       <div style="max-width:420px;text-align:center;padding:32px;">
         <h1 style="font-size:20px;color:#E8500A;">Ambition Angels</h1>
         <p style="color:#3D3D3D;font-size:15px;line-height:1.6;">${message}</p>
       </div>
     </body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

async function unsubscribe(req: NextRequest): Promise<Response> {
  const params = req.nextUrl.searchParams;
  const token = params.get("t") ?? "";
  // Current links carry the constituent in c_id (c= is campaign attribution).
  // Pre-Phase-1 links used c= for the constituent; the token only verifies
  // against the constituent id, so trying both is unambiguous.
  const cid = [params.get("c_id") ?? "", params.get("c") ?? ""].find(
    (v) => isUuid(v) && verifyUnsubscribe(v, token)
  );
  if (!cid) {
    return page(
      "This unsubscribe link is invalid or has expired. Email remi@ambitionangels.org and we'll take care of it.",
      400
    );
  }
  const campaignParam = params.get("c") ?? "";
  const campaignId = campaignParam !== cid && isUuid(campaignParam) ? campaignParam : null;

  try {
    const admin = getSupabaseAdmin();
    const { data: c } = await admin
      .from("constituents")
      .select("id, org_id, emails")
      .eq("id", cid)
      .maybeSingle();
    if (!c) return page("Something went wrong. Please email remi@ambitionangels.org to unsubscribe.", 500);

    const emails = Array.from(
      new Set(((c.emails as string[] | null) ?? []).map((e) => e.trim()).filter(Boolean))
    );
    if (emails.length > 0) {
      // Attribute to the campaign only if it exists (FK) and belongs to the
      // same org as the constituent — the c= param is attacker-controllable.
      let source: string | null = null;
      if (campaignId) {
        const { data: camp } = await admin
          .from("email_campaigns")
          .select("id")
          .eq("id", campaignId)
          .eq("org_id", c.org_id)
          .maybeSingle();
        source = camp ? campaignId : null;
      }
      const rows = emails.map((email) => ({
        org_id: c.org_id as string,
        email,
        reason: "unsubscribed",
        source_campaign_id: source,
      }));
      // First suppression wins: never downgrade a bounce/complaint/manual row.
      const { error } = await admin
        .from("email_suppressions")
        .upsert(rows, { onConflict: "org_id,email", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    console.error("[unsubscribe] failed:", (e as Error).message);
    return page("Something went wrong. Please email remi@ambitionangels.org to unsubscribe.", 500);
  }
  return page("You've been unsubscribed. You won't receive further emails from us. Changed your mind? Just reply to any past email.");
}

export async function GET(req: NextRequest) {
  return unsubscribe(req);
}

// RFC 8058 one-click: mail clients POST to the List-Unsubscribe URL.
export async function POST(req: NextRequest) {
  return unsubscribe(req);
}
