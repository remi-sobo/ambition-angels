import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { isAckChannel } from "@/lib/fundraising/ack-channels";
import { markGiftThanked } from "@/lib/fundraising/ack-mark";

// POST /api/admin/acknowledgments/mark/bulk { ids: [...], channel? } — the
// Thank-yous list's bulk "Mark thanked" (V4 B1, DataTable v2 bulk action).
// Records that each gift was thanked outside BloomOS. It never sends an
// email: sending stays a per-gift, reviewed action in the composer.

const MAX = 200;
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest) {
  const gate = await requirePermission("fundraising.write");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  const body = (await req.json().catch(() => null)) as { ids?: unknown; channel?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? Array.from(new Set(body!.ids.filter(isUuid))) : [];
  if (ids.length === 0) return NextResponse.json({ error: "Pick at least one gift." }, { status: 400 });
  if (ids.length > MAX) return NextResponse.json({ error: `Mark up to ${MAX} at a time.` }, { status: 400 });
  const channel = isAckChannel(body?.channel) ? (body!.channel as string) : "other";

  const supabase = createServerSupabase();
  const user = await getAdminUser();
  let marked = 0;
  let already = 0;
  let failed = 0;
  const warnings: string[] = [];
  for (const giftId of ids) {
    const r = await markGiftThanked(supabase, { orgId: ctx.orgId, giftId, channel, user });
    if (r.result === "marked") marked++;
    else if (r.result === "already") already++;
    else failed++;
    if (r.warning) warnings.push(r.warning);
  }

  if (marked > 0) {
    await audit(req, {
      action: "fundraising.acknowledgment.mark_bulk",
      entityType: "gifts",
      after: { channel, marked, already, failed, gift_ids: ids },
    });
  }
  if (marked === 0) {
    return NextResponse.json(
      { error: failed > 0 ? "Could not mark these gifts thanked. Try again." : "These gifts were already thanked." },
      { status: failed > 0 ? 500 : 409 },
    );
  }
  return NextResponse.json({ ok: true, marked, already, failed, warning: warnings[0] });
}
