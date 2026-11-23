import { TERM_KEYS, type TermKey } from "@/lib/admin/onboarding/answers";

/**
 * V4 Stage F: Settings → Terms. The words an org can rename (org_terminology,
 * read by lib/admin/terminology.ts) with what each one names and the
 * built-in word used when the org leaves it blank. PURE.
 */

export const TERM_ROWS: { key: TermKey; builtIn: string; names: string }[] = [
  { key: "student", builtIn: "Student", names: "A person in your programs (the roster)." },
  { key: "cohort", builtIn: "Cohort", names: "A group people are enrolled in together." },
  { key: "program", builtIn: "Program", names: "A program that groups run under." },
  { key: "session", builtIn: "Session", names: "One meeting of a group, where attendance is taken." },
  { key: "stage", builtIn: "Stage", names: "Where a participant is in their journey." },
  { key: "volunteer", builtIn: "Volunteer", names: "Someone who gives time, like a coach or mentor." },
  { key: "partner", builtIn: "Partner", names: "A school, company or group you work with." },
  { key: "staff", builtIn: "Staff", names: "Your team (said as a group, never made plural)." },
  { key: "board", builtIn: "Board", names: "Your board of directors (said as a group)." },
];

export type TermsCheck = { ok: true; terms: Record<string, string> } | { ok: false; error: string };

/** Body: { terms: { student: "Youth", cohort: "" } }. Empty resets to the built-in word. */
export function validateTermsInput(body: Record<string, unknown> | null): TermsCheck {
  const raw = body?.terms;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Nothing to save." };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(TERM_KEYS as readonly string[]).includes(k)) return { ok: false, error: `"${k}" is not a word BloomOS lets you rename.` };
    if (typeof v !== "string") return { ok: false, error: "Each word must be text." };
    const label = v.trim().replace(/\s+/g, " ");
    if (label.length > 40) return { ok: false, error: "Keep each word under 40 characters." };
    if (label && !/^[A-Za-z0-9\u00C0-\u024F '&.-]+$/.test(label)) return { ok: false, error: `Use letters and spaces for "${label}".` };
    out[k] = label;
  }
  if (Object.keys(out).length === 0) return { ok: false, error: "Nothing to save." };
  return { ok: true, terms: out };
}
