import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { constituentName } from "@/lib/fundraising/display";

// POST /api/admin/acknowledgments/draft — AI-drafted personal thank-you
// note for one gift, grounded in the donor's real giving history.
// Draft-then-approve: the result lands in an editable textarea and nothing
// is sent or stored here. The IRS compliance block is NEVER drafted by AI —
// it's appended server-side at send time (lib/fundraising/receipt.ts).
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { gift_id?: string } | null;
  const giftId = typeof body?.gift_id === "string" ? body.gift_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(giftId)) {
    return NextResponse.json({ error: "gift_id is required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const { data: gift, error } = await supabase
    .from("gifts")
    .select("id, amount, gift_date, recurring_plan_id, constituent_id")
    .eq("id", giftId)
    .maybeSingle();
  if (error || !gift) {
    return NextResponse.json({ error: "Gift not found" }, { status: 404 });
  }

  let donorFirstName = "there";
  let history = "This donor's history is unavailable — keep the note general.";
  if (gift.constituent_id) {
    const [cRes, gRes] = await Promise.all([
      supabase
        .from("constituents")
        .select("type, first_name, last_name, org_name")
        .eq("id", gift.constituent_id)
        .maybeSingle(),
      supabase
        .from("gifts")
        .select("amount, gift_date")
        .eq("constituent_id", gift.constituent_id)
        .order("gift_date", { ascending: true })
        .limit(200),
    ]);
    if (cRes.data) {
      donorFirstName = cRes.data.first_name || constituentName(cRes.data);
    }
    const all = (gRes.data ?? []).map((g) => ({ amount: Number(g.amount), date: g.gift_date }));
    if (all.length > 0) {
      const total = all.reduce((s, g) => s + g.amount, 0);
      const isFirst = all.length === 1;
      history = [
        `Gift count: ${all.length}${isFirst ? " (this is their FIRST gift)" : ""}.`,
        `First gave: ${all[0].date}. Lifetime total: $${total.toFixed(2)}.`,
        gift.recurring_plan_id ? "This gift is part of a monthly recurring plan." : "",
      ]
        .filter(Boolean)
        .join(" ");
    }
  }

  const prompt = `Write a short personal thank-you note (2-4 sentences) from Ambition Angels — a nonprofit helping teens from under-resourced communities discover real career paths — to a donor.

Donor first name: ${donorFirstName}
This gift: $${Number(gift.amount).toFixed(2)} on ${gift.gift_date}
Giving history: ${history}

Rules:
- Warm, specific, human. Reference their history naturally (first-time donor vs. returning vs. monthly).
- Mention what their support makes possible for teens, concretely but briefly.
- Do NOT include any tax, receipt, or legal language — that's appended separately.
- Do NOT include a subject line, greeting beyond using their first name, or signature block. Start with "Dear ${donorFirstName}," and end after the last sentence of thanks.
- Output ONLY the note text.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error("Anthropic API error:", await res.text());
      return NextResponse.json({ error: "Draft generation failed" }, { status: 502 });
    }
    const data = await res.json();
    const draft = (data.content?.[0]?.text ?? "").trim();
    if (!draft) {
      return NextResponse.json({ error: "Draft generation returned nothing" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, draft });
  } catch (e) {
    console.error("Acknowledgment draft error:", e);
    return NextResponse.json({ error: "Draft generation failed" }, { status: 502 });
  }
}
