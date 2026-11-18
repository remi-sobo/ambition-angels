import "server-only";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { marketingOrigin } from "@/lib/origins";
import { fullName, toPlan, type AmbitionPlan, type MatchStatus } from "./program";

// Server side of Ambition Coach: private-link lookups and the program emails.
// A private link is /coach/me/<access_token>. The token is the only key a
// student or coach holds, so every lookup resolves the person first and then
// scopes everything else to that person's org and matches.

export type CoachPerson = {
  id: string;
  org_id: string;
  kind: "coach" | "student";
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  field: string;
  role: string | null;
  company: string | null;
  linkedin: string | null;
  age: number | null;
  school: string | null;
  program: string | null;
  goal: string | null;
  timing: string | null;
  referral: string | null;
  note: string | null;
  staff_note: string | null;
  status: string;
  access_token: string;
  link_sent_at: string | null;
  last_seen_at: string | null;
  created_at: string;
};

export type CoachSession = {
  id: string;
  match_id: string;
  n: number;
  scheduled_on: string | null;
  done_at: string | null;
  student_note: string | null;
  coach_note: string | null;
};

export type CoachMatch = {
  id: string;
  org_id: string;
  coach_id: string;
  student_id: string;
  status: MatchStatus;
  intro_sent_at: string | null;
  plan: AmbitionPlan;
  plan_updated_at: string | null;
  plan_shared_at: string | null;
  coach_reaction: string | null;
  coach_reaction_at: string | null;
  created_at: string;
};

export const TOKEN_RE = /^[a-f0-9]{64}$/;

export function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const privateUrl = (token: string) => `${marketingOrigin()}/coach/me/${token}`;

export async function getPersonByToken(token: string): Promise<CoachPerson | null> {
  if (!TOKEN_RE.test(token)) return null;
  const { data } = await getSupabaseAdmin()
    .from("coach_people")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();
  return (data as CoachPerson | null) ?? null;
}

export type PrivateView = {
  person: CoachPerson;
  matches: {
    match: CoachMatch;
    other: CoachPerson;
    sessions: CoachSession[];
  }[];
};

/** Everything a private page shows, scoped to the person behind the token. */
export async function loadPrivateView(token: string): Promise<PrivateView | null> {
  const person = await getPersonByToken(token);
  if (!person) return null;
  const db = getSupabaseAdmin();
  const side = person.kind === "coach" ? "coach_id" : "student_id";
  const { data: matchRows } = await db
    .from("coach_matches")
    .select("*")
    .eq("org_id", person.org_id)
    .eq(side, person.id)
    .neq("status", "ended")
    .order("created_at", { ascending: false });
  const matches = ((matchRows ?? []) as CoachMatch[]).map((m) => ({ ...m, plan: toPlan(m.plan) }));
  if (matches.length === 0) return { person, matches: [] };

  const otherIds = matches.map((m) => (person.kind === "coach" ? m.student_id : m.coach_id));
  const [{ data: others }, { data: sessions }] = await Promise.all([
    db.from("coach_people").select("*").eq("org_id", person.org_id).in("id", otherIds),
    db
      .from("coach_sessions")
      .select("id, match_id, n, scheduled_on, done_at, student_note, coach_note")
      .eq("org_id", person.org_id)
      .in("match_id", matches.map((m) => m.id))
      .order("n"),
  ]);
  const byId = new Map(((others ?? []) as CoachPerson[]).map((p) => [p.id, p]));
  return {
    person,
    matches: matches
      .map((match) => ({
        match,
        other: byId.get(person.kind === "coach" ? match.student_id : match.coach_id)!,
        sessions: ((sessions ?? []) as CoachSession[]).filter((s) => s.match_id === match.id),
      }))
      .filter((m) => m.other),
  };
}

// ── Email ────────────────────────────────────────────────────────────────

const FROM = "Remi Sobomehin <careers@mail.ambitionangels.org>";
const REMI = "remi@ambitionangels.org";

function resend() {
  return new Resend(process.env.RESEND_API_KEY);
}

/** Sends a person their private link. Throws on a send failure. */
export async function sendPrivateLink(p: CoachPerson): Promise<void> {
  const url = privateUrl(p.access_token);
  const text =
    p.kind === "student"
      ? `Hi ${p.first_name},

This is your Ambition Coach page:
${url}

Everything for the program lives there. Who your coach is, what to prep before each session, and your Ambition Plan, which you'll build as you go. It saves as you type.

This link is just for you, so don't share it. If you lose it, reply to this email and I'll send a new one.

Rooting for you,
Remi`
      : `Hi ${p.first_name},

This is your Ambition Coach page:
${url}

It has your student's profile, a short prep card before each session, and their Ambition Plan as they build it. Before session 4 you can leave your reaction to the plan right on the page.

This link is just for you, so please don't forward it. If you lose it, reply here and I'll send a new one.

With gratitude,
Remi`;
  const { error } = await resend().emails.send({
    from: FROM,
    replyTo: REMI,
    to: p.email,
    subject: "Your Ambition Coach page",
    text,
  });
  if (error) throw new Error(error.message);
}

/** The group intro: coach + student on one thread, Remi cc'd. */
export async function sendIntro(coach: CoachPerson, student: CoachPerson): Promise<void> {
  const coachLine = [coach.role, coach.company].filter(Boolean).join(" at ");
  const studentLine = [student.school, student.program].filter(Boolean).join(", ");
  const text = `${coach.first_name}, meet ${student.first_name}. ${student.first_name}, meet ${coach.first_name}.

${coach.first_name} is ${coachLine || `working in ${coach.field.toLowerCase()}`}${coach.linkedin ? ` (${coach.linkedin})` : ""}. ${student.first_name} is heading into ${student.field.toLowerCase()}${studentLine ? ` (${studentLine})` : ""}.

Here's how this works. You'll meet four times, about 45 minutes each, over the next couple of months. ${student.first_name}, you own the schedule. Reply all with a few times that work for session 1 and send the calendar invite.

You each have your own Ambition Coach page with the prep for every session. I sent those links separately. ${student.first_name}, your Ambition Plan lives on your page and ${coach.first_name} can see it as it comes together.

I'm grateful for you both. Can't wait to hear how it goes.

Remi`;
  const { error } = await resend().emails.send({
    from: FROM,
    replyTo: REMI,
    to: [student.email, coach.email],
    cc: REMI,
    subject: `Ambition Coach intro: ${fullName(student)} + ${fullName(coach)}`,
    text,
  });
  if (error) throw new Error(error.message);
}

/** Activity note to Remi (or a coach/student). Never throws; await it so the
 *  send isn't cut off when the serverless function returns. */
export async function notify(subject: string, text: string, to: string | string[] = REMI): Promise<void> {
  try {
    await resend().emails.send({ from: "Ambition Angels <careers@mail.ambitionangels.org>", replyTo: REMI, to, subject, text });
  } catch (err) {
    console.error("coach notify error:", err);
  }
}
