import { NextRequest, NextResponse } from "next/server";
import type { AdminUser } from "@/lib/admin/auth";

/**
 * Match the submitted password against the three accepted env vars in
 * priority order: per-user passwords first, then the legacy shared one.
 * The order matters when values overlap — during transition all three may
 * carry the same value, in which case Remi's per-user identity wins.
 */
function matchUser(
  submitted: string
): { user: AdminUser; password: string } | null {
  const remi = process.env.ADMIN_PASSWORD_REMI;
  const shannon = process.env.ADMIN_PASSWORD_SHANNON;
  const legacy = process.env.ADMIN_PASSWORD;

  if (remi && submitted === remi) return { user: "remi", password: remi };
  if (shannon && submitted === shannon)
    return { user: "shannon", password: shannon };
  if (legacy && submitted === legacy)
    return { user: "remi", password: legacy };
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const password = body && typeof body === "object" ? body.password : null;

  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const match = matchUser(password);
  if (!match) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 8, // 8 hours
    path: "/",
  };

  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_auth", match.password, cookieOpts);
  res.cookies.set("admin_user", match.user, cookieOpts);
  return res;
}
