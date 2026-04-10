import { NextRequest, NextResponse } from "next/server";

type Answers = {
  age: string;
  status: string;
  location: string;
  subjects: string[];
  freetime: string;
  flowstate: string;
  workstyle: string[];
  whenwrong: string;
  problemtypes: string[];
  goodat: string;
  peoplecome: string;
  traits: Record<string, number>;
  workenvironments: string[];
  moneyvsmeaning: number;
  dreamday: string;
  futureself: string;
  teenname: string;
  email: string;
};

function buildPrompt(answers: Answers, audienceMode: string): string {
  const location = answers.location || "the San Francisco Bay Area";
  const m = answers.moneyvsmeaning;
  const moneyMeaningText =
    m <= 2 ? "strongly money-motivated"
    : m <= 4 ? "leans toward money"
    : m === 5 ? "balanced between money and meaning"
    : m <= 7 ? "leans toward mission"
    : "strongly mission-driven";

  return [
    "You are an elite career coach. Read this person deeply and return the 10 most personally resonant career matches. Every result must feel written specifically for this human.",
    "",
    "NOTE: " + (audienceMode === "adult" ? "Completed by an adult on behalf of a teen." : "Completed by the teen themselves."),
    "Teen name: " + (answers.teenname || "not provided"),
    "Age: " + answers.age,
    "Life stage: " + answers.status,
    "Location: " + location,
    "Interests: " + (answers.subjects.join(", ") || "not specified"),
    "Free time: " + (answers.freetime || "not specified"),
    "Flow state (highest signal): " + (answers.flowstate || "not specified"),
    "Work style: " + (answers.workstyle.join(", ") || "not specified"),
    "When things go wrong: " + answers.whenwrong,
    "Problem types: " + (answers.problemtypes.join(", ") || "not specified"),
    "Good at (high signal): " + (answers.goodat || "not specified"),
    "People come to them for (very high signal): " + (answers.peoplecome || "not specified"),
    "Personality: creative " + (answers.traits.creative || "?") + "/5, problem solver " + (answers.traits.problemsolver || "?") + "/5, people person " + (answers.traits.peopleperson || "?") + "/5, leader " + (answers.traits.leader || "?") + "/5",
    "Work environment: " + (answers.workenvironments.join(", ") || "not specified"),
    "Money vs meaning: " + m + "/10, " + moneyMeaningText,
    "Dream work day: " + (answers.dreamday || "not specified"),
    "Future self goal: " + (answers.futureself || "not specified"),
    "",
    "RULES: Flow state drives top 3 matches. Mission score 7-10 = lead with nonprofit/education/healthcare. Do not suggest generic defaults (Software Developer, Data Analyst, Accountant) unless explicitly indicated. The why must reference something specific from their answers. Include 2 unexpected gems they never considered but will immediately recognize as perfect.",
    "",
    "SALARY: Show accurate local rates for " + location + ". Show ceiling not just floor.",
    "",
    "Return ONLY a raw valid JSON array of exactly 10 objects. No preamble. No markdown.",
    "Each object: title, description (max 14 words starting with You), salary, why (max 12 words referencing something specific)",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { answers, audienceMode } = body;

  if (!answers || !audienceMode) {
    return NextResponse.json({ error: "Missing answers or audienceMode" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const prompt = buildPrompt(answers, audienceMode);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Anthropic API error:", err);
      return NextResponse.json({ error: "Career matching failed" }, { status: 500 });
    }

    const data = await res.json();
    const raw = data.content[0].text.replace(/```json|```/g, "").trim();
    const careers = JSON.parse(raw);
    return NextResponse.json({ careers });
  } catch (err) {
    console.error("Career match error:", err);
    return NextResponse.json({ error: "Career matching failed" }, { status: 500 });
  }
}
