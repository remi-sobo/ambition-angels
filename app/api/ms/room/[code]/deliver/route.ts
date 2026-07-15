import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeClaimCode, ROOM_CODE_LENGTH } from "@/lib/ms/claim";
import { generateText } from "@/lib/ai/gateway";

export const maxDuration = 120; // one model call + one email

// Host-only: the one-file delivery (Phase 5). Every deck in the room, with
// claim codes and conversation prompts, in one email to the facilitator's
// inbox. This is the free sample of the Adult Guide dashboard.
//
// The AI conversation prompts are one of exactly two live model calls in
// the product (locked decision 8), they are facilitator-facing (an adult),
// strengths-only by construction, and the input is handles + career titles
// + trait sums — no free text from any child exists to send. If the call
// fails, the email still goes out without prompts.

type StudentPacket = {
  handle: string;
  claimCode: string;
  traits: Record<string, number>;
  cards: { title: string; cluesUsed: number }[];
  topRanked: string[];
};

function promptsInput(students: StudentPacket[]): string {
  return students
    .map(
      (s) =>
        `${s.handle}: strongest traits ${topTraits(s.traits)}; explored ${
          s.cards.map((c) => c.title).join(", ") || "nothing yet"
        }; top matches ${s.topRanked.slice(0, 3).join(", ")}`
    )
    .join("\n");
}

function topTraits(traits: Record<string, number>): string {
  return Object.entries(traits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => k)
    .join(" + ");
}

async function generatePrompts(students: StudentPacket[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const { text } = await generateText({
      system: [
        "You write one conversation prompt per student for a facilitator who just ran a career discovery game with middle schoolers.",
        "Each prompt is ONE sentence the facilitator can say to that student, pointing at a genuine strength and one career from their list, phrased as curiosity, not verdict.",
        "Strengths only. Never a deficit, never 'you're not', never a comparison between students. No emoji.",
        "Return one line per student, formatted exactly as: HANDLE :: prompt",
      ].join("\n"),
      prompt: promptsInput(students),
      tier: "fast",
      maxTokens: 1200,
    });
    for (const line of text.split("\n")) {
      const idx = line.indexOf("::");
      if (idx === -1) continue;
      const handle = line.slice(0, idx).trim();
      const prompt = line.slice(idx + 2).trim();
      if (handle && prompt) out.set(handle, prompt);
    }
  } catch (err) {
    console.error("ms room deliver: prompts generation failed (email goes out without):", err);
  }
  return out;
}

function buildRoomEmailHTML(
  roomCode: string,
  students: StudentPacket[],
  prompts: Map<string, string>
): string {
  const blocks = students
    .map((s) => {
      const cards =
        s.cards.map((c) => `${c.title} (clue ${c.cluesUsed})`).join(" &middot; ") ||
        "Explored nothing yet — their ranked list is waiting in the deck.";
      const prompt = prompts.get(s.handle);
      return `
    <tr>
      <td style="padding:14px 20px;border-bottom:1px solid #f0eeea;">
        <div style="font-size:15px;font-weight:700;color:#0E0E0E;">${s.handle}
          <span style="font-weight:400;color:#6B6960;font-size:12px;">&middot; deck code
            <a href="https://www.ambitionangels.org/ms/deck/${s.claimCode}" style="color:#E8500A;text-decoration:none;font-weight:700;letter-spacing:0.08em;">${s.claimCode}</a>
          </span>
        </div>
        <div style="font-size:12px;color:#6B6960;margin-top:4px;">${cards}</div>
        ${prompt ? `<div style="font-size:12px;color:#0E0E0E;margin-top:6px;padding:8px 10px;background:#FFF0EA;border-radius:8px;">&ldquo;${prompt}&rdquo;</div>` : ""}
      </td>
    </tr>`;
    })
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
          <td style="background:#0E0E0E;padding:32px;text-align:center;">
            <div style="font-size:22px;font-weight:900;color:#ffffff;">Ambition Angels</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px;letter-spacing:0.1em;text-transform:uppercase;">Room ${roomCode} &middot; every deck, one file</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 8px;">
            <div style="font-size:14px;color:#6B6960;line-height:1.6;">
              ${students.length} students played <strong>What Are You Built For</strong> in your room.
              Each line below is one student: what their table explored, how few clues it took, their
              permanent deck code, and a conversation starter written for that student. Students are
              listed by their in-room handle — we never collect a student's name or email.
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 8px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0eeea;border-radius:12px;overflow:hidden;">
              ${blocks}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 32px;text-align:center;">
            <div style="font-size:12px;color:#6B6960;line-height:1.6;">
              Deck codes are permanent — any device, no login. The next step for any of these
              students is a 30-day simulated internship in the
              <a href="https://www.ambitionangels.org/the-app" style="color:#E8500A;text-decoration:none;">Ambition app</a>.<br>
              Career data: U.S. Department of Labor O*NET&reg; and Bureau of Labor Statistics.
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const code = normalizeClaimCode(params.code);
  if (code.length !== ROOM_CODE_LENGTH) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const hostToken = typeof body.host_token === "string" ? body.host_token : "";

  const supabase = getSupabaseAdmin();
  const { data: room } = await supabase
    .from("ms_rooms")
    .select("id, room_code, host_email, host_token")
    .eq("room_code", code)
    .maybeSingle();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.host_token !== hostToken) {
    return NextResponse.json({ error: "Not the host" }, { status: 403 });
  }

  const { data: sessions } = await supabase
    .from("ms_sessions")
    .select("id, handle, claim_code, trait_scores, ranked_careers")
    .eq("room_id", room.id)
    .order("created_at", { ascending: true });
  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ error: "Nobody joined this room" }, { status: 409 });
  }

  const socCodes = new Set<string>();
  for (const s of sessions) {
    for (const r of (s.ranked_careers ?? []) as { soc_code: string }[]) socCodes.add(r.soc_code);
  }
  const [{ data: occs }, { data: explored }] = await Promise.all([
    supabase.from("ms_occupations").select("soc_code, title").in("soc_code", Array.from(socCodes)),
    supabase
      .from("ms_explored")
      .select("session_id, soc_code, clues_used")
      .in("session_id", sessions.map((s) => s.id)),
  ]);
  const titleBySoc = new Map((occs ?? []).map((o) => [o.soc_code, o.title]));

  const students: StudentPacket[] = sessions.map((s) => ({
    handle: s.handle ?? "Player",
    claimCode: s.claim_code,
    traits: (s.trait_scores ?? {}) as Record<string, number>,
    cards: (explored ?? [])
      .filter((e) => e.session_id === s.id)
      .map((e) => ({ title: titleBySoc.get(e.soc_code) ?? e.soc_code, cluesUsed: e.clues_used })),
    topRanked: ((s.ranked_careers ?? []) as { soc_code: string }[])
      .slice(0, 3)
      .map((r) => titleBySoc.get(r.soc_code) ?? r.soc_code),
  }));

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error("ms room deliver: RESEND_API_KEY not set");
    return NextResponse.json({ error: "Email is not configured" }, { status: 500 });
  }

  const prompts = await generatePrompts(students);

  try {
    await new Resend(resendKey).emails.send({
      from: "Ambition Angels <careers@mail.ambitionangels.org>",
      to: room.host_email,
      subject: `Room ${room.room_code}: ${students.length} career decks from today's session`,
      html: buildRoomEmailHTML(room.room_code, students, prompts),
    });
  } catch (err) {
    console.error("ms room deliver: send failed:", err);
    return NextResponse.json({ error: "Sending failed. Try again." }, { status: 502 });
  }

  // Record the handoff per session, same ledger as the solo path.
  const { error } = await supabase.from("ms_deliveries").insert(
    sessions.map((s) => ({ session_id: s.id, adult_email: room.host_email }))
  );
  if (error) console.error("ms room deliver: log insert failed:", error);

  return NextResponse.json({ ok: true, students: students.length });
}
