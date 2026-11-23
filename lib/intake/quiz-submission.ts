import { adminUrl } from "@/lib/origins";
import { clean, esc, notifyAddress, sendMail } from "./notify";
import type { KindHandler } from "./types";

/**
 * Career quiz result (was app/api/quiz-submit). AA-only: needs aa.quiz.
 * The website still emails the quiz taker their matches. BloomOS keeps the
 * record and tells the operator.
 */

type Career = { title?: string; description?: string; salary?: string; why?: string };

export type QuizSubmissionInput = {
  audience: string;
  answers: Record<string, unknown>;
  careers: Career[];
};

const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => clean(x, 120)).filter(Boolean).join(", ") || null : null);

export const quizSubmission: KindHandler<QuizSubmissionInput> = {
  scope: "intake:forms",
  entitlement: "aa.quiz",
  validate(body) {
    const answers = body.answers;
    const audience = clean(body.audienceMode ?? body.audience, 40);
    const careers = body.careers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers) || !audience || !Array.isArray(careers)) {
      return { ok: false, error: "Missing required fields" };
    }
    return {
      ok: true,
      data: { audience, answers: answers as Record<string, unknown>, careers: careers.slice(0, 20) as Career[] },
    };
  },
  async run(ctx, { audience, answers: a, careers }) {
    const email = clean(a.email, 200);
    const row = {
      org_id: ctx.org.id,
      email: email || null,
      teen_name: clean(a.teenname, 120) || null,
      audience,
      age: clean(a.age, 20) || null,
      status: clean(a.status, 80) || null,
      location: clean(a.location, 160) || null,
      subjects: list(a.subjects),
      work_style: list(a.workstyle),
      problem_types: list(a.problemtypes),
      good_at: clean(a.goodat, 1000) || null,
      people_come: clean(a.peoplecome, 1000) || null,
      free_time: clean(a.freetime, 1000) || null,
      flow_state: clean(a.flowstate, 1000) || null,
      dream_day: clean(a.dreamday, 1000) || null,
      future_self: clean(a.futureself, 1000) || null,
      money_vs_meaning: (a.moneyvsmeaning as number | string | null | undefined) ?? null,
      career_matches: careers,
    };
    const { data, error } = await ctx.db.from("quiz_submissions").insert(row).select("id").single();
    if (error || !data) throw new Error(`quiz_submissions insert: ${error?.message ?? "no row"}`);

    const to = notifyAddress(ctx.org);
    if (to) {
      const top = careers.slice(0, 3).map((c) => c.title || "—").join(", ") || "—";
      await sendMail(ctx.org, {
        to,
        subject: `New career quiz: ${row.teen_name || email || "(anonymous)"}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">
  <strong>New career quiz</strong><br><br>
  Name: ${esc(row.teen_name || "—")}<br>
  Email: ${esc(email || "—")}<br>
  Audience: ${esc(audience)}<br>
  Age: ${esc(row.age || "—")}<br>
  Top matches: ${esc(top)}<br><br>
  <a href="${adminUrl("/admin/legacy")}">See it in BloomOS</a>
</div>`,
      });
    }
    return { id: data.id as string };
  },
};
