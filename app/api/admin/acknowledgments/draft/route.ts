import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { requireEntitlement } from "@/lib/admin/entitlements";
import { hasPermission } from "@/lib/admin/permissions";
import { loadAckContext } from "@/lib/admin/ackContextLoad";
import { orgOverAICap } from "@/lib/ai/cap";
import { logAICall } from "@/lib/ai/ledger";
import { cleanVoiceText } from "@/lib/ai/voice";
import {
  ackDraftTool,
  buildAckDraftPrompt,
  cleanNudge,
  parseAckDraft,
  resolveVoice,
  type AckDraftKind,
} from "@/lib/agents/ack-draft/prompt";
import { constituentName } from "@/lib/fundraising/display";
import { getAgentOrgProfile } from "@/lib/agents/org-profile";
import { generateStructured, generateText } from "@/lib/ai/gateway";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// POST /api/admin/acknowledgments/draft — AI-drafted personal thank-you
// note for one gift, grounded in the donor's real giving history.
// Draft-then-approve: the result lands in an editable textarea and nothing
// is sent or stored here. The IRS compliance block is NEVER drafted by AI —
// it's appended server-side at send time (lib/fundraising/receipt.ts).
//
// Two shapes:
//  - { gift_id }: the Fundraising composer's personal note (unchanged).
//  - { gift_id, kind: "email" | "talking_points", nudge? }: the Needs-you
//    popout's draft (specs/needs-you-popout-thank-yous.md, PR 4) — gated on
//    ai.ack_draft, fundraising.write, the org's AI cap, and do-not-contact;
//    prompted only from facts the server loads; logged by ids and tokens only.
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Admin-gated, but still a model call — a generous per-IP ceiling on runaway loops.
  const rl = rateLimit(`ack-draft:${getClientIp(req)}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many draft requests. Please try again shortly." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { gift_id?: string; kind?: unknown; nudge?: unknown } | null;
  const giftId = typeof body?.gift_id === "string" ? body.gift_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(giftId)) {
    return NextResponse.json({ error: "gift_id is required" }, { status: 400 });
  }
  if (body?.kind !== undefined) {
    if (body.kind !== "email" && body.kind !== "talking_points") {
      return NextResponse.json({ error: "kind must be email or talking_points" }, { status: 400 });
    }
    return draftForPopout(giftId, body.kind, cleanNudge(body.nudge));
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 503 });
  }

  const supabase = createServerSupabase();
  const { data: gift, error } = await supabase
    .from("gifts")
    .select("id, amount, gift_date, recurring_plan_id, constituent_id")
    .eq("id", giftId)
    // RLS is permission-scoped; the active org is the fence for owners of
    // several orgs, so another org's gift id is a 404.
    .eq("org_id", ctx.orgId)
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

  // Per-tenant identity: the resident org keeps its hand-tuned framing; every
  // other org drafts in its own name with no invented program facts.
  const profile = await getAgentOrgProfile();
  const identity = profile.isResident
    ? "Ambition Angels — a nonprofit helping teens from under-resourced communities discover real career paths"
    : `${profile.orgName}, a nonprofit`;
  const impactRule = profile.isResident
    ? "- Mention what their support makes possible for teens, concretely but briefly."
    : "- Mention briefly that their support advances the organization's work. You have NOT been given this organization's programs or mission — never invent specifics about what it does.";
  const prompt = `Write a short personal thank-you note (2-4 sentences) from ${identity} to a donor.

Donor first name: ${donorFirstName}
This gift: $${Number(gift.amount).toFixed(2)} on ${gift.gift_date}
Giving history: ${history}

Rules:
- Warm, specific, human. Reference their history naturally (first-time donor vs. returning vs. monthly).
${impactRule}
- Do NOT include any tax, receipt, or legal language — that's appended separately.
- Do NOT include a subject line, greeting beyond using their first name, or signature block. Start with "Dear ${donorFirstName}," and end after the last sentence of thanks.
- Output ONLY the note text.`;

  try {
    // Through the shared gateway: prompt-cached, and the prose is swept for
    // voice (no em dashes) before it reaches the editable draft.
    const { text } = await generateText({ prompt, tier: "fast", maxTokens: 400 });
    const draft = text.trim();
    if (!draft) {
      return NextResponse.json({ error: "Draft generation returned nothing" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, draft });
  } catch (e) {
    console.error("Acknowledgment draft error:", e);
    return NextResponse.json({ error: "Draft generation failed" }, { status: 502 });
  }
}

const DRAFT_TIMEOUT_MS = 20_000;

/** The Needs-you popout's draft: email, or call talking points + follow-up. */
async function draftForPopout(giftId: string, kind: AckDraftKind, nudge: string | null) {
  const ent = await requireEntitlement("ai.ack_draft");
  if (!ent.ok) return NextResponse.json({ error: ent.error }, { status: ent.status });
  const { orgId, orgName } = ent.ctx;
  const supabase = createServerSupabase();

  // Drafting is part of thanking: the same permission as marking it sent.
  if (!(await hasPermission(supabase, orgId, "fundraising.write"))) {
    return NextResponse.json({ error: "You need fundraising edit access to draft thank-yous." }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 503 });
  }
  const cap = await orgOverAICap(supabase, orgId);
  if (cap.over) {
    return NextResponse.json({ error: "This month's AI budget is used up. Write this one by hand." }, { status: 429 });
  }

  const [res, orgRes] = await Promise.all([
    loadAckContext(supabase, orgId, giftId),
    supabase.from("orgs").select("settings").eq("id", orgId).maybeSingle(),
  ]);
  if (res.status === 404) return NextResponse.json({ error: "Gift not found" }, { status: 404 });
  if (res.status !== 200) return NextResponse.json({ error: "Couldn't load this gift." }, { status: 500 });
  if (res.context.donor.doNotContact) {
    return NextResponse.json({ error: "This donor is marked do not contact." }, { status: 409 });
  }

  const voice = resolveVoice((orgRes.data as { settings?: unknown } | null)?.settings, orgName);
  const { system, prompt } = buildAckDraftPrompt({ ctx: res.context, orgName, voice, kind, nudge });
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const out = await Promise.race([
      generateStructured({ system, prompt, tier: "fast", maxTokens: 1200, tool: ackDraftTool(kind) }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("draft timed out")), DRAFT_TIMEOUT_MS);
      }),
    ]);
    const draft = parseAckDraft(out.input, kind);
    // Ids, kind, latency and tokens only: never donor names or draft text.
    await logAICall(supabase, {
      orgId,
      surface: "acknowledgment",
      model: out.model,
      tokensInput: out.usage.inputTokens,
      tokensOutput: out.usage.outputTokens,
      costUsd: out.costUsd,
      status: draft ? "success" : "failed",
      metadata: { gift_id: giftId, kind, latency_ms: Date.now() - started, nudged: Boolean(nudge) },
    });
    if (!draft) return NextResponse.json({ error: "The draft came back empty. Try again." }, { status: 502 });
    // House voice sweep (no em dashes) on every field a person will send.
    return NextResponse.json({
      ok: true,
      kind,
      subject: cleanVoiceText(draft.subject),
      body: cleanVoiceText(draft.body),
      points: draft.points?.map((p) => cleanVoiceText(p)) ?? null,
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.message === "draft timed out";
    // The error's own message (API status, timeout) helps ops; it carries no
    // prompt text. Never log the prompt, the facts, or a draft.
    const reason = e instanceof Error ? e.message.slice(0, 200) : "unknown";
    console.error("[ack-draft] failed:", { gift_id: giftId, kind, timedOut, latency_ms: Date.now() - started, reason });
    return NextResponse.json(
      { error: timedOut ? "Drafting took too long. Try again, or write this one by hand." : "Draft generation failed" },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
