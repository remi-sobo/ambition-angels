import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { analyzeDonor } from "@/lib/fundraising/retention";
import { personalize, buildCampaignEmail } from "@/lib/fundraising/comms-email";
import { loadOrgCommsSettings, sendBlocker, type OrgCommsSettings } from "@/lib/comms/settings";

// Epic J — journey automation engine. Runs hourly (vercel.json): enrolls
// constituents on each active journey's trigger, then advances every due
// enrollment by one step (sending via the comms email path). Honors
// do-not-contact at every send; unique(journey,constituent) prevents
// re-enrollment / duplicate spam.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

const nowIso = () => new Date().toISOString();
const plusDaysIso = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

type Admin = ReturnType<typeof getSupabaseAdmin>;
type Step = { step_order: number; delay_days: number; subject: string; body: string };

// Insert an enrollment if the constituent is contactable and not already in
// this journey. next_run_at honors the first step's delay. org_id comes from
// the journey row — a service-role write must never ride a column default.
async function tryEnroll(admin: Admin, journeyId: string, orgId: string, constituentId: string, step0Delay: number) {
  const { data: c } = await admin
    .from("constituents")
    .select("emails, do_not_contact")
    .eq("org_id", orgId)
    .eq("id", constituentId)
    .maybeSingle();
  if (!c || c.do_not_contact) return;
  if (!((c.emails as string[] | null) ?? [])[0]) return;
  await admin
    .from("journey_enrollments")
    .upsert(
      { org_id: orgId, journey_id: journeyId, constituent_id: constituentId, current_step: 0, next_run_at: plusDaysIso(step0Delay), status: "active" },
      { onConflict: "journey_id,constituent_id", ignoreDuplicates: true }
    );
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Email not configured" }, { status: 500 });

  const admin = getSupabaseAdmin();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const today = new Date().toISOString().slice(0, 10);
  let enrolled = 0;
  let sent = 0;
  let failed = 0;

  // ── Enrollment ──
  const { data: journeys } = await admin.from("journeys").select("id, org_id, trigger").eq("status", "active");

  // Sending identity per org; a missing/incomplete settings row blocks that
  // org's sends (same refusal the campaign send path makes).
  const settingsCache = new Map<string, OrgCommsSettings | null>();
  const settingsFor = async (orgId: string): Promise<OrgCommsSettings | null> => {
    if (!settingsCache.has(orgId)) settingsCache.set(orgId, await loadOrgCommsSettings(admin, orgId));
    return settingsCache.get(orgId)!;
  };
  const stepCache = new Map<string, Step[]>();
  const stepsFor = async (journeyId: string): Promise<Step[]> => {
    if (stepCache.has(journeyId)) return stepCache.get(journeyId)!;
    const { data } = await admin
      .from("journey_steps")
      .select("step_order, delay_days, subject, body")
      .eq("journey_id", journeyId)
      .order("step_order", { ascending: true });
    const steps = (data ?? []) as Step[];
    stepCache.set(journeyId, steps);
    return steps;
  };

  for (const j of (journeys ?? []) as Array<{ id: string; org_id: string; trigger: string }>) {
    const steps = await stepsFor(j.id);
    if (steps.length === 0) continue;
    const step0Delay = steps[0].delay_days;

    if (j.trigger === "first_gift") {
      // Org fence: a journey enrolls ITS org's donors only. Without the
      // filter every tenant's recent donors would be enrolled (and emailed).
      const { data: recent } = await admin
        .from("gifts").select("constituent_id").eq("org_id", j.org_id).gte("gift_date", daysAgo(2)).not("constituent_id", "is", null).limit(5000);
      const ids = Array.from(new Set((recent ?? []).map((g) => g.constituent_id as string)));
      for (const id of ids) {
        const { count } = await admin.from("gifts").select("id", { count: "exact", head: true }).eq("org_id", j.org_id).eq("constituent_id", id);
        if ((count ?? 0) === 1) { await tryEnroll(admin, j.id, j.org_id, id, step0Delay); enrolled++; }
      }
    } else if (j.trigger === "lapsed") {
      const { data: gifts } = await admin
        .from("gifts").select("constituent_id, gift_date").eq("org_id", j.org_id).not("constituent_id", "is", null).limit(20000);
      const byDonor = new Map<string, string[]>();
      for (const g of gifts ?? []) {
        const id = g.constituent_id as string;
        (byDonor.get(id) ?? byDonor.set(id, []).get(id)!).push(g.gift_date as string);
      }
      const { data: plans } = await admin.from("recurring_plans").select("constituent_id").eq("org_id", j.org_id).eq("status", "active");
      const activePlan = new Set((plans ?? []).map((p) => p.constituent_id as string));
      for (const [id, dates] of Array.from(byDonor.entries())) {
        const { flags } = analyzeDonor(dates, today, activePlan.has(id));
        if (flags.includes("lybunt") || flags.includes("cadence_lapsed")) { await tryEnroll(admin, j.id, j.org_id, id, step0Delay); enrolled++; }
      }
    }
  }

  // ── Execution: advance due enrollments by one step ──
  const { data: due } = await admin
    .from("journey_enrollments")
    .select("id, journey_id, constituent_id, current_step")
    .eq("status", "active")
    .lte("next_run_at", nowIso())
    .limit(300);

  const activeJourneyIds = new Set((journeys ?? []).map((j) => j.id));
  const triggerById = new Map((journeys ?? []).map((j) => [j.id, j.trigger]));
  const orgById = new Map((journeys ?? []).map((j) => [j.id, j.org_id as string]));

  for (const e of (due ?? []) as Array<{ id: string; journey_id: string; constituent_id: string; current_step: number }>) {
    if (!activeJourneyIds.has(e.journey_id)) continue; // journey paused → hold
    const steps = await stepsFor(e.journey_id);
    if (e.current_step >= steps.length) {
      await admin.from("journey_enrollments").update({ status: "completed" }).eq("id", e.id);
      continue;
    }
    const step = steps[e.current_step];

    const { data: c } = await admin
      .from("constituents")
      .select("emails, first_name, do_not_contact")
      .eq("org_id", orgById.get(e.journey_id)!)
      .eq("id", e.constituent_id)
      .maybeSingle();
    const email = ((c?.emails as string[] | null) ?? [])[0];
    if (!c || c.do_not_contact || !email) {
      await admin.from("journey_enrollments").update({ status: "cancelled" }).eq("id", e.id);
      continue;
    }

    // Suppression check (unsubscribed / bounced / complained). Unsubscribe no
    // longer sets do_not_contact, so this is the check that keeps journeys
    // from emailing someone who opted out. citext equality is case-insensitive.
    const { data: sup } = await admin
      .from("email_suppressions")
      .select("id")
      .eq("org_id", orgById.get(e.journey_id)!)
      .eq("email", email)
      .maybeSingle();
    if (sup) {
      await admin.from("journey_enrollments").update({ status: "cancelled" }).eq("id", e.id);
      continue;
    }

    // Double-thank guard. The acknowledgment matrix owns the immediate
    // first-gift receipt; journeys own the nurture after it. If this donor was
    // thanked in the last few days, skip a first_gift journey's opening step
    // and advance straight into the later nurture, so nobody gets two
    // "thanks for your first gift" emails in an hour.
    if (triggerById.get(e.journey_id) === "first_gift" && e.current_step === 0) {
      const { data: recentAck } = await admin
        .from("gifts")
        .select("id")
        .eq("org_id", orgById.get(e.journey_id)!)
        .eq("constituent_id", e.constituent_id)
        .eq("acknowledgment_status", "sent")
        .gte("acknowledged_at", new Date(Date.now() - 3 * 86_400_000).toISOString())
        .limit(1);
      if (recentAck && recentAck.length > 0) {
        const nextStep = e.current_step + 1;
        if (nextStep >= steps.length) {
          await admin
            .from("journey_enrollments")
            .update({ status: "completed", current_step: nextStep, last_step_at: nowIso() })
            .eq("id", e.id);
        } else {
          await admin
            .from("journey_enrollments")
            .update({ current_step: nextStep, last_step_at: nowIso(), next_run_at: plusDaysIso(steps[nextStep].delay_days) })
            .eq("id", e.id);
        }
        continue;
      }
    }

    const settings = await settingsFor(orgById.get(e.journey_id)!);
    if (sendBlocker(settings) || !settings) {
      // No sending identity for this org — hold the enrollment and retry
      // tomorrow rather than sending from a constant or dropping the step.
      failed++;
      console.error(`[cron/journeys] send blocked for org ${orgById.get(e.journey_id)}: ${sendBlocker(settings)}`);
      await admin.from("journey_enrollments").update({ next_run_at: plusDaysIso(1) }).eq("id", e.id);
      continue;
    }

    try {
      const { error: sendError } = await resend.emails.send(
        buildCampaignEmail({
          settings,
          to: email,
          subject: step.subject,
          bodyText: personalize(step.body, (c.first_name as string) ?? ""),
          constituentId: e.constituent_id,
        })
      );
      if (sendError) throw new Error(sendError.message);
      sent++;
      const nextStep = e.current_step + 1;
      if (nextStep >= steps.length) {
        await admin.from("journey_enrollments").update({ status: "completed", current_step: nextStep, last_step_at: nowIso() }).eq("id", e.id);
      } else {
        await admin.from("journey_enrollments").update({ current_step: nextStep, last_step_at: nowIso(), next_run_at: plusDaysIso(steps[nextStep].delay_days) }).eq("id", e.id);
      }
    } catch (err) {
      failed++;
      console.error("[cron/journeys] send failed:", (err as Error).message);
      // Throttle a failing enrollment so it doesn't retry every run.
      await admin.from("journey_enrollments").update({ next_run_at: plusDaysIso(1) }).eq("id", e.id);
    }
  }

  return NextResponse.json({ ok: true, enrolled, sent, failed });
}
