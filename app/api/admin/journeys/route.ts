import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Epic J — create a journey with its ordered email steps in one shot.
const TRIGGERS = ["first_gift", "lapsed", "manual"] as const;

type StepIn = { subject?: unknown; body?: unknown; delay_days?: unknown };

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const trigger = (TRIGGERS.includes(body.trigger as (typeof TRIGGERS)[number]) ? body.trigger : "manual") as string;

  const rawSteps = Array.isArray(body.steps) ? (body.steps as StepIn[]) : [];
  const steps = rawSteps
    .map((s) => ({
      subject: typeof s.subject === "string" ? s.subject.trim() : "",
      body: typeof s.body === "string" ? s.body : "",
      delay_days: typeof s.delay_days === "number" && s.delay_days >= 0 ? Math.round(s.delay_days) : 0,
    }))
    .filter((s) => s.subject && s.body.trim());
  if (steps.length === 0) return NextResponse.json({ error: "Add at least one step (subject + body)" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: journey, error } = await supabase
    .from("journeys")
    .insert({ org_id: ctx.orgId, name, trigger, status: "active", created_by: (await getAdminUser()) ?? null })
    .select("id")
    .single();
  if (error || !journey) {
    console.error("[journeys] create failed:", error?.message);
    return NextResponse.json({ error: "Could not create journey" }, { status: 500 });
  }

  const { error: sErr } = await supabase.from("journey_steps").insert(
    steps.map((s, i) => ({ org_id: ctx.orgId, journey_id: journey.id, step_order: i, delay_days: s.delay_days, subject: s.subject, body: s.body.slice(0, 20000) }))
  );
  let warning: string | undefined;
  if (sErr) {
    console.error("[journeys] steps insert failed:", sErr.message);
    warning = "Journey created but steps failed to save — edit it.";
  }

  await audit(req, { action: "fundraising.journey.create", entityType: "journeys", entityId: journey.id, after: { name, trigger, steps: steps.length } });
  return NextResponse.json({ id: journey.id, warning });
}
