import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { adminUrl } from "@/lib/origins";
import { getPersonByToken, notify, privateUrl } from "@/lib/coach/server";
import { fullName, toPlan, PLAN_LIMIT } from "@/lib/coach/program";

// Writes from a private Ambition Coach page (/coach/me/<token>). The token is
// the credential: it resolves one person, and every write is limited to that
// person's own matches (by side) inside their org. A student writes their plan
// and their session notes; a coach writes their reaction and their notes.
// Matches still "proposed" are invisible here until Remi sends the intro.

const VISIBLE = ["intro_sent", "active", "done"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const rl = rateLimit(`coach-me:${params.token.slice(0, 16)}`, { limit: 240, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too many saves. Give it a minute." }, { status: 429 });

  const person = await getPersonByToken(params.token);
  if (!person) return NextResponse.json({ error: "This link isn't valid anymore." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const db = getSupabaseAdmin();
  const side = person.kind === "coach" ? "coach_id" : "student_id";
  const matchId = typeof body.match_id === "string" ? body.match_id : "";
  const { data: match } = await db
    .from("coach_matches")
    .select("id, status, coach_id, student_id, plan_shared_at")
    .eq("org_id", person.org_id)
    .eq("id", matchId)
    .eq(side, person.id)
    .maybeSingle();
  if (!match || !VISIBLE.includes(match.status)) {
    return NextResponse.json({ error: "We couldn't find that match." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const touchActive = async () => {
    if (match.status === "intro_sent") {
      await db.from("coach_matches").update({ status: "active" }).eq("org_id", person.org_id).eq("id", match.id);
    }
  };
  const otherId = person.kind === "coach" ? match.student_id : match.coach_id;
  const loadOther = async () =>
    (
      await db
        .from("coach_people")
        .select("first_name, last_name, email, access_token")
        .eq("org_id", person.org_id)
        .eq("id", otherId)
        .maybeSingle()
    ).data;

  switch (body.action) {
    case "plan": {
      if (person.kind !== "student") return NextResponse.json({ error: "Only the student edits the plan." }, { status: 403 });
      const { error } = await db
        .from("coach_matches")
        .update({ plan: toPlan(body.plan), plan_updated_at: now })
        .eq("org_id", person.org_id)
        .eq("id", match.id);
      if (error) return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
      await touchActive();
      return NextResponse.json({ ok: true, saved_at: now });
    }

    case "plan_ready": {
      if (person.kind !== "student") return NextResponse.json({ error: "Only the student shares the plan." }, { status: 403 });
      const ready = body.ready !== false;
      await db
        .from("coach_matches")
        .update({ plan_shared_at: ready ? now : null })
        .eq("org_id", person.org_id)
        .eq("id", match.id);
      if (ready && !match.plan_shared_at) {
        const coach = await loadOther();
        if (coach) {
          await notify(
            `${person.first_name}'s Ambition Plan is ready`,
            `Hi ${coach.first_name},

${fullName(person)} marked their Ambition Plan ready for session 4. You can read it and leave your reaction on your page:
${privateUrl(coach.access_token as string)}

Remi`,
            coach.email as string,
          );
        }
        await notify(
          `Plan ready: ${fullName(person)}`,
          `${fullName(person)} marked their Ambition Plan ready.\n\n${adminUrl("/admin/programs/coach")}`,
        );
      }
      return NextResponse.json({ ok: true });
    }

    case "reaction": {
      if (person.kind !== "coach") return NextResponse.json({ error: "Only the coach leaves a reaction." }, { status: 403 });
      const text = typeof body.text === "string" ? body.text.trim().slice(0, PLAN_LIMIT) : "";
      await db
        .from("coach_matches")
        .update({ coach_reaction: text || null, coach_reaction_at: text ? now : null })
        .eq("org_id", person.org_id)
        .eq("id", match.id);
      if (text) {
        const student = await loadOther();
        if (student) {
          await notify(
            `${person.first_name} left notes on your plan`,
            `Hi ${student.first_name},

${person.first_name} read your Ambition Plan and left a reaction. See it on your page:
${privateUrl(student.access_token as string)}

Remi`,
            student.email as string,
          );
        }
      }
      return NextResponse.json({ ok: true, saved_at: now });
    }

    case "session": {
      const n = Number(body.n);
      if (![1, 2, 3, 4].includes(n)) return NextResponse.json({ error: "Invalid session." }, { status: 400 });
      const patch: Record<string, unknown> = {};
      if ("scheduled_on" in body) {
        const d = typeof body.scheduled_on === "string" ? body.scheduled_on : "";
        patch.scheduled_on = DATE_RE.test(d) ? d : null;
      }
      if ("done" in body) patch.done_at = body.done ? now : null;
      if ("note" in body) {
        const note = typeof body.note === "string" ? body.note.trim().slice(0, PLAN_LIMIT) : "";
        patch[person.kind === "coach" ? "coach_note" : "student_note"] = note || null;
      }
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
      const { error } = await db
        .from("coach_sessions")
        .update(patch)
        .eq("org_id", person.org_id)
        .eq("match_id", match.id)
        .eq("n", n);
      if (error) return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
      if (body.done) {
        await touchActive();
        await notify(
          `Session ${n} done: ${person.kind === "student" ? fullName(person) : `${fullName(person)} (coach)`}`,
          `${fullName(person)} marked session ${n} done.\n\n${adminUrl("/admin/programs/coach")}`,
        );
      }
      return NextResponse.json({ ok: true, saved_at: now });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
