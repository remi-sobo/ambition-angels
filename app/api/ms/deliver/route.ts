import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizeClaimCode, CLAIM_CODE_LENGTH } from "@/lib/ms/claim";

// Adult handoff (Phase 4). The one email field in the whole /ms product
// posts here, from behind a screen that says it is for a grown-up — no
// student email exists anywhere by construction (COPPA is structural,
// specs/ms-career-game.md locked decision 10). v1 ships store links; a
// real app code is an additive column later (D6).

type DeckCard = { title: string; payMedian: number | null; cluesUsed: number };

function buildDeckEmailHTML(claimCode: string, deckUrl: string, cards: DeckCard[]): string {
  const rows = cards
    .map(
      (c) => `
    <tr>
      <td style="padding:12px 20px;border-bottom:1px solid #f0eeea;">
        <div style="font-size:15px;font-weight:700;color:#0E0E0E;">${c.title}</div>
        <div style="font-size:12px;color:#6B6960;margin-top:2px;">
          Guessed on clue ${c.cluesUsed} of 8${c.payMedian != null ? ` &middot; median pay $${c.payMedian.toLocaleString("en-US")}/yr` : ""}
        </div>
      </td>
    </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
        <tr>
          <td style="background:#0E0E0E;padding:32px 32px 28px;text-align:center;">
            <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">Ambition Angels</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;letter-spacing:0.1em;text-transform:uppercase;">A career deck from a young person you know</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px;">
            <div style="font-size:14px;color:#6B6960;line-height:1.6;">
              A middle schooler played <strong>What Are You Built For</strong> — our free career
              discovery game — and chose you as their grown-up. Below is their deck: every career
              they explored, and how few clues it took their table to guess it. We never collect a
              student's email address; this came to you instead, on purpose.
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0eeea;border-radius:12px;overflow:hidden;">
              ${rows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0;text-align:center;">
            <div style="font-size:11px;font-weight:700;color:#6B6960;text-transform:uppercase;letter-spacing:0.1em;">Their deck code</div>
            <div style="font-size:34px;font-weight:900;color:#0E0E0E;letter-spacing:0.18em;margin-top:6px;">${claimCode}</div>
            <div style="margin-top:10px;">
              <a href="${deckUrl}" style="font-size:13px;color:#E8500A;text-decoration:none;font-weight:600;">Open the deck &rarr;</a>
            </div>
            <div style="font-size:12px;color:#6B6960;margin-top:8px;">
              The deck is permanent. Any device, no login, just the code.
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <div style="background:#E8500A;border-radius:16px;padding:28px;text-align:center;">
              <div style="font-size:16px;font-weight:700;color:#ffffff;margin-bottom:8px;">The next step is trying one on</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-bottom:20px;">The Ambition app runs 30-day simulated internships in careers like these. 15 minutes a day. Free.</div>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="padding-right:8px;">
                    <a href="https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279" style="display:inline-block;background:#ffffff;color:#E8500A;font-weight:700;font-size:13px;padding:12px 20px;border-radius:50px;text-decoration:none;">Download for iOS</a>
                  </td>
                  <td>
                    <a href="https://play.google.com/store/apps/details?id=com.theambitionapp.ambitionappRN" style="display:inline-block;background:rgba(255,255,255,0.15);color:#ffffff;font-weight:700;font-size:13px;padding:12px 20px;border-radius:50px;text-decoration:none;border:1px solid rgba(255,255,255,0.3);">Download for Android</a>
                  </td>
                </tr>
              </table>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 32px;text-align:center;">
            <div style="font-size:11px;color:#C8C6BE;line-height:1.6;">
              Career data: U.S. Department of Labor O*NET&reg; and Bureau of Labor Statistics.<br>
              Sent with care by Remi &amp; the Ambition Angels team &middot;
              <a href="https://www.ambitionangels.org" style="color:#E8500A;text-decoration:none;">ambitionangels.org</a>
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(`ms-deliver:${getClientIp(req)}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const claimCode = typeof body.claim_code === "string" ? normalizeClaimCode(body.claim_code) : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (claimCode.length !== CLAIM_CODE_LENGTH) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return NextResponse.json({ error: "That doesn't look like an email address" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: session } = await supabase
    .from("ms_sessions")
    .select("id, claim_code")
    .eq("claim_code", claimCode)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Code not found" }, { status: 404 });

  const { data: explored } = await supabase
    .from("ms_explored")
    .select("soc_code, clues_used, created_at, ms_occupations(title, pay_median)")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  const cards: DeckCard[] = (explored ?? []).map((e) => {
    const occ = e.ms_occupations as unknown as { title: string; pay_median: number | null } | null;
    return { title: occ?.title ?? "", payMedian: occ?.pay_median ?? null, cluesUsed: e.clues_used };
  });
  if (cards.length === 0) {
    return NextResponse.json({ error: "The deck is empty — explore a career first" }, { status: 409 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error("ms deliver: RESEND_API_KEY not set");
    return NextResponse.json({ error: "Email is not configured" }, { status: 500 });
  }

  const deckUrl = `https://www.ambitionangels.org/ms/deck/${session.claim_code}`;
  try {
    await new Resend(resendKey).emails.send({
      from: "Ambition Angels <careers@mail.ambitionangels.org>",
      to: email,
      subject: "A career deck from a young person you know",
      html: buildDeckEmailHTML(session.claim_code, deckUrl, cards),
    });
  } catch (err) {
    console.error("ms deliver: send failed:", err);
    return NextResponse.json({ error: "Sending failed. Try again." }, { status: 502 });
  }

  const { error } = await supabase
    .from("ms_deliveries")
    .insert({ session_id: session.id, adult_email: email });
  if (error) console.error("ms deliver: log insert failed:", error);

  return NextResponse.json({ ok: true });
}
