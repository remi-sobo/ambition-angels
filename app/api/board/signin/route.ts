import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isOnRoster } from "@/lib/board/auth";
import { audit } from "@/lib/audit";
import { marketingOrigin } from "@/lib/origins";

/**
 * Board portal sign-in. Magic link only (spec §4).
 *
 * The security property that matters: an address NOT on the board roster gets
 * the identical confirmation screen and no email is sent. The response body is
 * byte-identical in both cases, so a caller cannot enumerate the roster by
 * diffing responses. It also cannot be timed apart in any way that matters —
 * both paths do a roster read, and only the send differs.
 *
 * Deliberately NOT reusing /api/admin/login: that route sends a link with
 * emailRedirectTo=/admin, and a director following it would land on the
 * BloomOS admin shell rather than the portal.
 */

const GENERIC = { ok: true } as const;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const raw = body && typeof body.email === "string" ? body.email : "";
  // Postel: a pasted " Lara@Ambitionangels.org " with whitespace and mixed
  // case is a valid attempt. Trim and lowercase before doing anything.
  const email = raw.trim().toLowerCase();

  // Block the obviously malformed with a message that says what to fix. This
  // is not roster disclosure — it is the same answer for any bad string.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "That does not look like an email address. Check for a missing @ or a stray space." },
      { status: 400 },
    );
  }

  const { ok, orgId } = await isOnRoster(email);

  if (!ok) {
    // Nothing sent. Audit it so an unrecognized director emailing Shannon
    // "it never arrived" is answerable from the log rather than from memory.
    await audit(req, {
      action: "board.signin_not_on_roster",
      entityType: "auth",
      actorUserId: null,
      after: { email },
    });
    return NextResponse.json(GENERIC);
  }

  const supabase = createServerSupabase();
  // The CONFIGURED origin, never req.nextUrl.origin. Behind Vercel's edge the
  // request origin can resolve to the deployment URL
  // (ambition-angels-<hash>.vercel.app) rather than the public host. Supabase
  // matches emailRedirectTo against its redirect allowlist and, on a miss,
  // silently falls back to the project's Site URL — so the director clicks her
  // link, gets a valid session, and lands in BloomOS instead of the portal
  // with no error anywhere. lib/origins.ts exists for exactly this reason.
  const origin = marketingOrigin();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/board`,
      // Directors are provisioned by the seed's allowlist, not by self-signup.
      // A roster address with no auth user yet still needs one created on
      // first use, so this stays true — the roster check above is the gate.
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("Board magic link error:", error.message);
    // Still the generic shape: a director who mistypes should not learn
    // whether the failure was delivery or roster.
    return NextResponse.json(GENERIC);
  }

  await audit(req, {
    action: "board.magic_link_sent",
    entityType: "auth",
    actorUserId: null,
    after: { email, orgId },
  });
  return NextResponse.json(GENERIC);
}
