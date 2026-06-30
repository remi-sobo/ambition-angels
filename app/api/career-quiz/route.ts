import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/ai/gateway";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Unauthenticated and calls the model — throttle per IP to deter abuse.
  const rl = rateLimit(`career-quiz:${getClientIp(req)}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again in a few minutes." }, { status: 429 });
  }

  const body = await req.json();
  const { prompt } = body;

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    // voice: false — the payload is a structured catalog (salary ranges use a
    // dash that must survive), so it routes through the seam without the sweep.
    const { text } = await generateText({ prompt, tier: "fast", maxTokens: 1500, voice: false });
    const raw = text.replace(/```json|```/g, "").trim();
    const careers = JSON.parse(raw);
    return NextResponse.json({ careers });
  } catch (err) {
    console.error("Quiz API error:", err);
    return NextResponse.json({ error: "Career matching failed" }, { status: 500 });
  }
}
