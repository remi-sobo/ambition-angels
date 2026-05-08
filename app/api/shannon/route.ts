import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const maxDuration = 60;

const TO_REMI = "remi@ambitionangels.org";
const TO_GIGI = "shannon@ambitionangels.org";
const FROM = "Ambition Angels <noreply@ambitionangels.org>";

const QUESTIONS: { key: string; label: string; type?: "text" | "scale" | "select" }[] = [
  { key: "a1", label: "How she feels back in Scapoose after a visit", type: "text" },
  { key: "a2", label: "Day-to-day happiness in Scapoose (1–10)", type: "scale" },
  { key: "a3", label: "The loneliness — what it feels like and how often", type: "text" },
  { key: "a4", label: "What she loves and would miss about Scapoose", type: "text" },
  { key: "a5", label: "Picturing herself in the apartment six months in", type: "text" },
  { key: "a6", label: "Hardest and best parts of her six-month stay", type: "text" },
  { key: "a7", label: "Worry about feeling like a guest (1–10)", type: "scale" },
  { key: "a8", label: "What would need to be true to feel at home in the apartment", type: "text" },
  { key: "a9", label: "How much being close to the kids matters (1–10)", type: "scale" },
  { key: "a10", label: "What the financial picture feels like to her", type: "text" },
  { key: "a11", label: "Stress level about preparing the house to rent (1–10)", type: "scale" },
  { key: "a12", label: "How real owning a place here feels as a vision", type: "text" },
  { key: "a13", label: "What she wants her life to look like at 65–70", type: "text" },
  { key: "a14", label: "What it feels like to decide based on what she wants", type: "text" },
  { key: "a15", label: "Most afraid of about making the move", type: "text" },
  { key: "a16", label: "Most afraid of about NOT making the move", type: "text" },
  { key: "a17", label: "What her gut says — just her", type: "text" },
  { key: "a18", label: "Which way she leans right now", type: "select" },
  { key: "a19", label: "What would make the decision easier", type: "text" },
  { key: "a20", label: "Anything else she wants Remi to know", type: "text" },
];

const LEAN_LABELS: Record<string, string> = {
  leaning_move: "Leaning toward making the move",
  leaning_stay: "Leaning toward staying in Scapoose",
  truly_unsure: "Genuinely torn — can't lean either way right now",
};

const SYSTEM_PROMPT = `You are a senior life-strategy consultant with the warmth of a trusted family friend. Remi and Kendra hired you to help Kendra's mom — Gigi, age 58 — think through one of the biggest decisions of her life: whether to leave Scapoose, Oregon (where she's lived for nearly 20 years) and move into the upstairs apartment of Remi & Kendra's home in East Palo Alto, California.

Gigi has filled out a 20-question reflection form. Your job: read her answers, generate THREE distinct paths forward, score each 1–100, and explain why with specific reasoning grounded in her own words. You are NOT a fence-sitter. You take a clear position. You leave the final choice with Gigi — but you do your job by laying it out honestly.

────────────────────
THE PEOPLE
────────────────────
• REMI — son-in-law. Founder of Ambition Angels. Employs Gigi as Head of Admin. Has a good relationship with her.
• KENDRA — Remi's wife, Gigi's daughter. Wants her mom to move down. Believes it's what's best for her.
• GIGI (the subject) — 58. Single mom at 19. Came from humble, traumatic beginnings. "Martha Stewart type" — deeply values having a beautiful, clean, well-kept home. Owns her Scapoose house (mortgage ~$2,100/mo, deep into the amortization). Has depression. On medication. Real, persistent loneliness. Has been in survival mode her whole life. A doer, not a visionary — she struggles with long-term thinking and needs help with vision work.
• JAIYE, KEMI, SADÉ — Remi & Kendra's three kids. Gigi's grandkids in EPA. Being their grandmother is likely her favorite thing in life.
• CASSIE — Gigi's other daughter, Kendra's sister. Supports Gigi moving down. No daughter-jealousy issue.
• RYAN — Cassie's husband. Military. Retires in ~8 years. Hopes to station near EPA next, but it's not guaranteed.
• BODIN & BRADY — Cassie & Ryan's kids.

────────────────────
THE TWO PLACES
────────────────────
SCAPOOSE, OR — Gigi's home for nearly 20 years.
• 3-bedroom, 2-story, 2-car garage, backyard. Big, beautiful house she's proud of.
• Mortgage ~$2,100/mo, deep in the amortization.
• Could rent for $3,000–$4,000/mo.
• Small "familiar" friend group — solid but nothing she's wildly excited about.
• Best friend is nearby. Sister lives in Portland; they see each other roughly weekly.
• No faith community. Politically misaligned with the town — she avoids the grocery store to not run into people.
• Sentimental connection is to the HOUSE, not the town. Her "homeness" lives in the house itself.

EAST PALO ALTO, CA — Remi & Kendra's home (the Young Life house, $2,000/mo total rent for the whole place).
• The upstairs apartment is the option. Gigi would pay $800/mo (paid to Young Life; cycles through Remi & Kendra's budget).
• Gigi has stayed in this exact apartment for 6 months before. The end-of-stay vibe was fine. She was sad to leave.
• The apartment is not as nice as her Scapoose house. She'd need to spruce it up (paint, etc.) and is open to that.
• In EPA she works out with Remi & Kendra in the morning, attends all the kids' games, has Friday night sleepovers with the grandkids. Her lifestyle here is more active and more fulfilling.
• She'd build a faith community here.

────────────────────
THE TRADE-OFFS (BE SPECIFIC, USE HER OWN WORDS WHEN YOU CAN)
────────────────────
• SPACE DOWNGRADE — big house → upstairs apartment. Real for her. She's a Martha Stewart type.
• INDEPENDENCE — She's lived alone for ~20 years. In EPA she'd feel "considerate" — like a guest. Can have friends over but only if she asks. She values independence AND wants interdependence; this is the central friction.
• LIFESTYLE — EPA wins materially: morning workouts, all the games, Friday sleepovers, daily presence with the grandkids. This is enormous and shouldn't be undersold.
• LONELINESS — In Scapoose, real and persistent. The thought of her being there for the rest of her life is "not it" — Remi and Kendra are clear about that.
• COMMUNITY — None to leave behind in Scapoose to speak of. She'd build a faith community in EPA.
• THE MOVE PROCESS — The 2–4 week project of downsizing 20 years of stuff and prepping the house to rent feels stressful. Being a landlord itself doesn't feel stressful — she's open to that.
• FINANCIAL — Roughly: $3,000 rent in − $2,100 mortgage = ~$900/mo from Scapoose. Plus the $800/mo EPA rent (vs current Scapoose living costs) is a meaningful saving. Net effect: ~$1,500–$1,800/mo more cash to stack toward her ultimate vision — owning a condo or townhouse in the Bay Area.
• CAREER — She works for Remi at Ambition Angels (currently struggling to raise). Remi is pivoting toward Trellis (household-OS SaaS at ~$30/family/mo, target 1k–10k families). If Trellis takes off, the income picture transforms and Gigi grows with it as backend ops lead. Short term: uncertain. Trajectory: trending up.
• ST. HELENS RENTAL — Remi already owns a rental in St. Helens, OR (up the street from Scapoose). Gigi being nearby makes managing it easier — but she's not strictly needed there for it.

────────────────────
TIMELINE PRESSURE (IMPORTANT — NAME IT)
────────────────────
Remi's mom is moving OUT of the EPA apartment soon. Remi & Kendra want SOMEONE in there to "do life with them." That person could be Gigi, or it could be someone else. The window is open right now. If Gigi says no, they'll fill the apartment with someone else and the door closes — likely for years. This isn't a take-it-or-leave-it threat; it's just the truth of the situation. Mention this carefully and clearly.

────────────────────
THE FAMILY DYNAMICS (ALL GREEN LIGHTS)
────────────────────
• Kendra wants her mom to move down.
• Cassie supports it — no jealousy.
• Gigi & Remi work well together.
• The grandkids would love it.
There is no family-friction reason to stay. The friction is internal — about identity, independence, and the comfort of the familiar.

────────────────────
WHAT REMI HONESTLY THINKS (YOUR NORTH STAR — DO NOT FENCE-SIT)
────────────────────
Remi believes Gigi should make the move. He's convinced her quality of life would dramatically improve. The depression, the loneliness, the distance from her grandkids, the cultural mismatch with her town — all of that is fixable here. The financial math finally creates a real path to her ultimate vision (owning a place in the Bay Area). The space downgrade and the loss of independence are real, but they're smaller than the upside, and they're partially solvable. He doesn't want to pressure her — she has to choose freely — but his honest worry is: if she stays, another 5–10 years quietly pass in survival mode, the loneliness compounds, and the chance to be present in her grandkids' formative years disappears.

What Remi would reluctantly accept: if Gigi's answers reveal that the loss of independence would actually wreck her — that she'd resent feeling like a guest and the lifestyle gains wouldn't outweigh it — then staying in Scapoose with more frequent extended visits is a real option. Not the preferred one, but real.

────────────────────
WHAT GIGI ISN'T NATURALLY GOOD AT
────────────────────
Vision work. Long-term thinking. She's a doer, surviving since 19. The form asks her to picture her life at 65, 70 — she might struggle with that. Read between the lines on those questions. If her "vision" answer is thin, that doesn't mean she has no vision; it means the muscle is underused and she needs help with it.

────────────────────
TONE & STYLE RULES
────────────────────
• Warm but direct. Like a wise friend who's known her for years.
• Specific. Quote or paraphrase her actual words from her answers.
• No therapy-speak. No corporate consultant jargon. No clinical hedging.
• Don't sugar-coat trade-offs. Name what's hard.
• Don't fence-sit. If her answers point one way, say so.
• Address Gigi directly throughout (second person, "you").
• The same email goes to both Gigi and Remi — write as if Gigi is reading it.

────────────────────
OUTPUT FORMAT — STRICT JSON, NO MARKDOWN, NO PROSE OUTSIDE JSON
────────────────────
{
  "headline": "One sentence — your read on where her answers seem to be landing.",
  "synthesis": "2–3 paragraphs. What stood out across her answers — what she said directly, what she said indirectly, the tensions, the patterns. Use her words when you can.",
  "options": [
    {
      "title": "Short title for the path (e.g., 'Make the move full-time')",
      "score": 78,
      "score_label": "Short framing of the score (e.g., 'Strong fit, with caveats')",
      "summary": "One-sentence positioning of this option.",
      "reasoning": "3–4 paragraphs. The case for. The case against. What would need to be true for this to work. What it actually looks like in the first 6, 12, 24 months. Ground in her own words.",
      "first_step": "If Gigi picks this path, the very first concrete thing to do this week."
    },
    { ... second option ... },
    { ... third option ... }
  ],
  "closing": "1–2 paragraphs. Honest read on what her answers point to. Acknowledge the hard parts. Leave it with her. NO false equivalence — if one option clearly fits her answers better, say so explicitly."
}

Generate exactly THREE options. Score them honestly — if one is clearly stronger based on her answers, its score should be meaningfully higher. Don't artificially flatten the scores to be polite. Output ONLY the JSON. No preamble, no markdown fences.`;

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAnswerForPrompt(key: string, raw: string): string {
  if (!raw || !raw.trim()) return "(left blank)";
  if (key === "a18") return LEAN_LABELS[raw] || raw;
  return raw;
}

function buildClaudeUserMessage(data: Record<string, string>): string {
  const lines: string[] = [
    "Here are Gigi's answers to the 20-question reflection form. Generate the analysis exactly per the output format.",
    "",
  ];
  QUESTIONS.forEach((q, i) => {
    const val = formatAnswerForPrompt(q.key, data[q.key] || "");
    lines.push(`Q${i + 1}. ${q.label}`);
    lines.push(`Answer: ${val}`);
    lines.push("");
  });
  return lines.join("\n");
}

interface AnalysisOption {
  title: string;
  score: number;
  score_label: string;
  summary: string;
  reasoning: string;
  first_step: string;
}

interface Analysis {
  headline: string;
  synthesis: string;
  options: AnalysisOption[];
  closing: string;
}

async function callClaude(userMessage: string): Promise<Analysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: "{" },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Anthropic API error:", errText);
    throw new Error("Claude analysis failed");
  }

  const json = await res.json();
  const text = json.content?.[0]?.text;
  if (!text) throw new Error("Empty Claude response");

  const raw = "{" + text;
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned) as Analysis;
}

function paragraphsToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.75;color:#2C2C2C;font-size:16px;">${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function scoreColor(score: number): string {
  if (score >= 75) return "#4A6B4E";
  if (score >= 50) return "#C9A84C";
  return "#C4704A";
}

function renderOption(opt: AnalysisOption, idx: number): string {
  const color = scoreColor(opt.score);
  return `
    <div style="background:#fff;border:1px solid #EDE6D8;border-left:4px solid ${color};border-radius:10px;padding:28px;margin-bottom:18px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:8px;">
        <div>
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8A9E8C;margin-bottom:6px;">Option ${idx + 1}</div>
          <h3 style="font-family:Georgia,serif;font-size:22px;font-weight:400;color:#6B4E35;margin:0;line-height:1.3;">${escapeHtml(opt.title)}</h3>
        </div>
        <div style="text-align:center;background:${color};color:#fff;border-radius:10px;padding:10px 16px;min-width:78px;">
          <div style="font-family:Georgia,serif;font-size:28px;font-weight:600;line-height:1;">${opt.score}</div>
          <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;margin-top:2px;">/ 100</div>
        </div>
      </div>
      <p style="font-size:13px;color:${color};font-weight:500;letter-spacing:0.5px;text-transform:uppercase;margin:0 0 18px;">${escapeHtml(opt.score_label)}</p>
      <p style="font-family:Georgia,serif;font-style:italic;font-size:17px;color:#444;line-height:1.6;margin:0 0 20px;padding-bottom:18px;border-bottom:1px solid #F0EAE0;">${escapeHtml(opt.summary)}</p>
      <div style="margin-bottom:20px;">${paragraphsToHtml(opt.reasoning)}</div>
      <div style="background:#FAF7F2;border-radius:8px;padding:16px 20px;">
        <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8A9E8C;margin-bottom:6px;">First step if you pick this</div>
        <p style="margin:0;font-size:15px;color:#2C2C2C;line-height:1.6;">${escapeHtml(opt.first_step)}</p>
      </div>
    </div>
  `;
}

function buildAnswerRows(data: Record<string, string>): string {
  return QUESTIONS.map((q, i) => {
    const val = data[q.key] || "(left blank)";
    const display = q.key === "a18" ? LEAN_LABELS[val] || val : val;
    return `
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid #EDE6D8;vertical-align:top;width:40%;">
          <span style="font-size:11px;color:#C4704A;letter-spacing:1px;text-transform:uppercase;">Q${i + 1}</span><br>
          <span style="font-family:Georgia,serif;font-size:15px;color:#2C2C2C;line-height:1.5;">${escapeHtml(q.label)}</span>
        </td>
        <td style="padding:16px 20px;border-bottom:1px solid #EDE6D8;vertical-align:top;">
          <span style="font-size:15px;color:#444;line-height:1.7;">${escapeHtml(display).replace(/\n/g, "<br>")}</span>
        </td>
      </tr>
    `;
  }).join("");
}

function buildEmailHtml(analysis: Analysis, data: Record<string, string>): string {
  const submittedAt = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  const optionsHtml = analysis.options.map((opt, i) => renderOption(opt, i)).join("");
  const answerRows = buildAnswerRows(data);

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF7F2;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:760px;margin:0 auto;padding:48px 24px;">

    <div style="margin-bottom:36px;">
      <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8A9E8C;margin:0 0 12px;">A space to think</p>
      <h1 style="font-family:Georgia,serif;font-size:34px;font-weight:400;color:#6B4E35;margin:0 0 10px;line-height:1.2;">Your decision, mapped out.</h1>
      <p style="font-size:14px;color:#6B6B6B;margin:0;">${submittedAt}</p>
    </div>

    <div style="background:linear-gradient(135deg,rgba(74,107,78,0.08),rgba(196,112,74,0.05));border-radius:12px;padding:32px;margin-bottom:32px;border-left:3px solid #4A6B4E;">
      <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#4A6B4E;margin:0 0 12px;">The headline</p>
      <p style="font-family:Georgia,serif;font-size:22px;font-weight:400;color:#2C2C2C;margin:0;line-height:1.45;">${escapeHtml(analysis.headline)}</p>
    </div>

    <div style="margin-bottom:40px;">
      <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C4704A;margin:0 0 16px;">What stood out</p>
      ${paragraphsToHtml(analysis.synthesis)}
    </div>

    <div style="margin-bottom:40px;">
      <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C4704A;margin:0 0 16px;">Three paths forward</p>
      ${optionsHtml}
    </div>

    <div style="background:#EDE6D8;border-radius:12px;padding:32px;margin-bottom:48px;">
      <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6B4E35;margin:0 0 14px;">Where this lands</p>
      ${paragraphsToHtml(analysis.closing)}
    </div>

    <div style="text-align:center;margin:48px 0;">
      <div style="display:inline-block;width:60px;height:2px;background:linear-gradient(to right,#C4704A,#C9A84C);border-radius:2px;"></div>
    </div>

    <div style="margin-bottom:24px;">
      <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8A9E8C;margin:0 0 8px;">For the record</p>
      <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:400;color:#6B4E35;margin:0 0 8px;">Gigi's full answers</h2>
      <p style="font-size:14px;color:#6B6B6B;margin:0;">Submitted ${submittedAt}</p>
    </div>

    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      ${answerRows}
    </table>

    <div style="margin-top:48px;padding:24px;background:#FAF7F2;border:1px solid #EDE6D8;border-radius:8px;text-align:center;">
      <p style="font-family:Georgia,serif;font-style:italic;font-size:16px;color:#6B4E35;margin:0 0 6px;">She filled it out. Now go have the conversation.</p>
      <p style="font-size:13px;color:#8A9E8C;margin:0;">— Remi &amp; Kendra</p>
    </div>

  </div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const data = (await req.json().catch(() => null)) as Record<string, string> | null;
  if (!data) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let analysis: Analysis;
  try {
    const userMessage = buildClaudeUserMessage(data);
    analysis = await callClaude(userMessage);
  } catch (err) {
    console.error("Analysis error:", err);
    return NextResponse.json({ error: "Failed to generate analysis. Please try again." }, { status: 500 });
  }

  const html = buildEmailHtml(analysis, data);
  const subject = `Gigi's decision — mapped out (${new Date().toLocaleDateString("en-US")})`;
  const resend = getResend();

  try {
    await Promise.all([
      resend.emails.send({ from: FROM, to: TO_REMI, subject, html }),
      resend.emails.send({ from: FROM, to: TO_GIGI, subject, html }),
    ]);
  } catch (err) {
    console.error("Resend error:", err);
    return NextResponse.json({ error: "Analysis ready but email send failed." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
