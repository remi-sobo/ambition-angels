// Ambition Coach program content and shapes, shared by the public /coach
// pages, the private /coach/me pages and the BloomOS Coach page. Client-safe:
// no server imports here.

export const COACH_FIELDS = [
  "Software engineering",
  "Hardware and computer engineering",
  "Cybersecurity",
  "Data and AI",
  "Product and project management",
  "Finance and banking",
  "Investing and wealth management",
  "Accounting",
  "Marketing and social media",
  "Sales and business development",
  "Entrepreneurship",
  "Design (UX, graphic, product)",
  "Healthcare and nursing",
  "Law",
  "Education",
  "Media and entertainment",
  "Trades and construction",
  "Other",
] as const;

export const PERSON_STATUSES = ["new", "talked", "ready", "matched", "done", "not_now"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];
export const PERSON_STATUS_LABELS: Record<PersonStatus, string> = {
  new: "New",
  talked: "Talked",
  ready: "Ready to match",
  matched: "Matched",
  done: "Finished",
  not_now: "Not now",
};

export const MATCH_STATUSES = ["proposed", "intro_sent", "active", "done", "ended"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  proposed: "Proposed",
  intro_sent: "Intro sent",
  active: "Meeting",
  done: "Finished",
  ended: "Ended early",
};

export type SessionGuide = {
  n: 1 | 2 | 3 | 4;
  name: string;
  goal: string;
  studentPrep: string[];
  coachPrep: string[];
};

export const SESSIONS: SessionGuide[] = [
  {
    n: 1,
    name: "The reality check",
    goal: "Get clear on what the job really is, and what it isn't.",
    studentPrep: [
      "Write two or three sentences on why you want this field. Put them in the first part of your plan below.",
      "Bring three questions about what the job is like day to day.",
      "Send your coach a calendar invite for 45 minutes.",
    ],
    coachPrep: [
      "Be ready to tell your real path, detours included.",
      "Think about what a normal week looks like for you, and the part people don't expect.",
      "Ask why they picked this field and listen for what they've heard versus what they know.",
    ],
  },
  {
    n: 2,
    name: "The map",
    goal: "What actually gets someone in, and the cheapest real route.",
    studentPrep: [
      "Find two entry-level job postings in this field and bring the links.",
      "Write down what they ask for that you don't have yet.",
      "Fill in what you learned from session 1 in your plan.",
    ],
    coachPrep: [
      "Which credential actually matters, and which ones don't?",
      "The entry roles nobody talks about.",
      "What you'd do if you were starting at their age, with their resources.",
    ],
  },
  {
    n: 3,
    name: "The work",
    goal: "Skills, resume, and how the field is changing.",
    studentPrep: [
      "Bring your resume, or a list of what you've done if you don't have one yet.",
      "Fill in the skills and experience you still need in your plan.",
    ],
    coachPrep: [
      "What you did three years ago that you don't do now. What changed, AI included.",
      "What new hires need that you didn't.",
      "Look over their resume with an honest eye.",
    ],
  },
  {
    n: 4,
    name: "The move",
    goal: "They read their plan back to you and leave with three dated moves.",
    studentPrep: [
      "Finish your Ambition Plan, including three moves with dates.",
      "Mark it ready so your coach can read it before you meet.",
      "Be ready to read it out loud.",
    ],
    coachPrep: [
      "Read their plan before you meet and leave your reaction on your page.",
      "Push on the three moves. Are they specific? Are the dates real?",
      "If you can, make one introduction to a person or opportunity. One is enough.",
    ],
  },
];

export type PlanMove = { action: string; due: string };
export type AmbitionPlan = {
  career: string;
  why: string;
  learned: string;
  needs: string;
  changing: string;
  moves: PlanMove[];
};

export const PLAN_LIMIT = 2000;

export const EMPTY_PLAN: AmbitionPlan = {
  career: "",
  why: "",
  learned: "",
  needs: "",
  changing: "",
  moves: [
    { action: "", due: "" },
    { action: "", due: "" },
    { action: "", due: "" },
  ],
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Normalize anything (stored jsonb or a request body) into a plan. */
export function toPlan(raw: unknown): AmbitionPlan {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const moves = Array.isArray(r.moves) ? r.moves : [];
  return {
    career: str(r.career, 200),
    why: str(r.why, PLAN_LIMIT),
    learned: str(r.learned, PLAN_LIMIT),
    needs: str(r.needs, PLAN_LIMIT),
    changing: str(r.changing, PLAN_LIMIT),
    moves: [0, 1, 2].map((i) => {
      const m = (moves[i] && typeof moves[i] === "object" ? moves[i] : {}) as Record<string, unknown>;
      const due = str(m.due, 10);
      return { action: str(m.action, 300), due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : "" };
    }),
  };
}

/** How many of the plan's eight parts have something in them. */
export function planProgress(p: AmbitionPlan): { filled: number; total: number } {
  const parts = [p.career, p.why, p.learned, p.needs, p.changing, ...p.moves.map((m) => m.action)];
  return { filled: parts.filter((s) => s.trim().length > 0).length, total: parts.length };
}

export const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`.trim();
