import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadPrivateView } from "@/lib/coach/server";
import CoachSpace, { type SpaceMatch } from "./CoachSpace";

// A student's or coach's private Ambition Coach page. The token in the URL is
// the only key; nothing here is indexed or linked from anywhere public.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Ambition Coach page",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const VISIBLE = ["intro_sent", "active", "done"];

export default async function CoachMePage({ params }: { params: { token: string } }) {
  const view = await loadPrivateView(params.token);

  if (!view) {
    return (
      <section className="bg-cream section-pad min-h-[60vh]">
        <div className="container-site max-w-xl">
          <h1 className="font-heading font-bold text-3xl text-ink mb-4">This link isn&apos;t working</h1>
          <p className="text-charcoal leading-relaxed">
            It may have been replaced with a new one. Email Remi at{" "}
            <span className="select-all font-semibold">remi@ambitionangels.org</span> and he&apos;ll send you a fresh
            link.
          </p>
        </div>
      </section>
    );
  }

  const { person } = view;
  // Seen-at is a convenience for staff, not load-bearing.
  await getSupabaseAdmin()
    .from("coach_people")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("org_id", person.org_id)
    .eq("id", person.id)
    .then(
      () => undefined,
      () => undefined,
    );

  // Only what this viewer should see: never the other person's token.
  const matches: SpaceMatch[] = view.matches
    .filter((m) => VISIBLE.includes(m.match.status))
    .map(({ match, other, sessions }) => ({
      id: match.id,
      status: match.status,
      plan: match.plan,
      plan_updated_at: match.plan_updated_at,
      plan_shared_at: match.plan_shared_at,
      coach_reaction: match.coach_reaction,
      coach_reaction_at: match.coach_reaction_at,
      other: {
        first_name: other.first_name,
        last_name: other.last_name,
        email: other.email,
        field: other.field,
        role: other.role,
        company: other.company,
        linkedin: other.linkedin,
        school: other.school,
        program: other.program,
        goal: other.goal,
        age: other.age,
      },
      sessions: [1, 2, 3, 4].map((n) => {
        const s = sessions.find((x) => x.n === n);
        return {
          n,
          scheduled_on: s?.scheduled_on ?? null,
          done_at: s?.done_at ?? null,
          student_note: s?.student_note ?? null,
          coach_note: s?.coach_note ?? null,
        };
      }),
    }));

  return (
    <CoachSpace
      token={params.token}
      kind={person.kind}
      firstName={person.first_name}
      field={person.field}
      matches={matches}
      pending={view.matches.some((m) => m.match.status === "proposed")}
    />
  );
}
