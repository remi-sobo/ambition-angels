import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getAdminUser } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";
import { getMetricCatalog } from "@/lib/admin/metrics/catalog";
import { requireComms } from "@/lib/comms/stories-server";
import { loadEdition } from "@/lib/comms/editions-server";
import {
  compileEdition,
  type CompileMetric,
  type CompileStory,
} from "@/lib/comms/compile";

/**
 * Compile an edition into an email_campaigns draft (spec §6.5, §7.4).
 *
 * GET previews. POST writes. Both run the SAME compile, so what someone reads
 * before clicking is what lands.
 *
 * ── The two boundaries ──────────────────────────────────────────────────────
 * 1. Consent is re-checked HERE, at compile, not just when the slot was
 *    filled. Stories are read from v_publishable_stories; a story that has
 *    dropped out of it since is a hard block with a named reason (spec §10).
 * 2. email_campaigns is fundraising-domain: its RLS is fundraising.write.
 *    comms.manage does not imply it. Today the same three roles hold both, but
 *    that is org config, not code, so this checks explicitly and says what is
 *    missing instead of letting an RLS refusal surface as a 500.
 *
 * Compile does not stitch the footer, the mailing address, or the unsubscribe
 * link: buildCampaignEmail() appends all three at send time. It also never
 * touches recipients or suppression — it makes a draft and hands off.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** email_campaigns.subject is NOT NULL, and the title is the honest fallback.
 *  One definition, so the preview shows the line that actually gets sent. */
const subjectFor = (e: { subject: string | null; title: string }) =>
  (e.subject ?? "").trim() || e.title;

async function prepare(editionId: string) {
  const g = await requireComms();
  if (!g.ok) return { ok: false as const, res: g.res };
  const { ctx, supabase } = g;

  const detail = await loadEdition(supabase, ctx.orgId, editionId);
  if (!detail) {
    return { ok: false as const, res: NextResponse.json({ error: "Edition not found" }, { status: 404 }) };
  }

  const storyIds = Array.from(
    new Set(detail.slots.map((s) => s.story_id).filter((v): v is string => !!v)),
  );
  const metricIds = Array.from(new Set(detail.slots.flatMap((s) => s.metric_ids ?? [])));

  const [{ data: pub }, catalog] = await Promise.all([
    storyIds.length > 0
      ? supabase
          .from("v_publishable_stories")
          .select("id, title, body, outcome")
          .eq("org_id", ctx.orgId)
          .in("id", storyIds)
      : Promise.resolve({ data: [] as CompileStory[] }),
    metricIds.length > 0 ? getMetricCatalog() : Promise.resolve([]),
  ]);

  const storiesById = new Map(
    ((pub ?? []) as unknown as CompileStory[]).map((s) => [s.id, s]),
  );
  const metricsById = new Map(
    catalog
      .filter((m) => metricIds.includes(m.id))
      .map((m): [string, CompileMetric] => [
        m.id,
        {
          id: m.id,
          name: m.name,
          unit: m.unit,
          latest: m.latest?.value ?? null,
          captured_on: m.latest?.captured_on ?? null,
          stale: m.stale,
        },
      ]),
  );

  const result = compileEdition({ slots: detail.slots, storiesById, metricsById });
  return { ok: true as const, ctx, supabase, detail, result };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const p = await prepare(params.id);
  if (!p.ok) return p.res;
  return NextResponse.json({
    body: p.result.body,
    warnings: p.result.warnings,
    blocked: p.result.blocked,
    subject: subjectFor(p.detail.edition),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const p = await prepare(params.id);
  if (!p.ok) return p.res;
  const { ctx, supabase, detail, result } = p;

  if (detail.edition.status === "sent") {
    return NextResponse.json(
      { error: "This edition has already gone out." },
      { status: 409 },
    );
  }
  if (result.blocked.length > 0) {
    return NextResponse.json({ error: result.blocked[0], blocked: result.blocked }, { status: 409 });
  }

  if (!(await hasPermission(supabase, ctx.orgId, "fundraising.write"))) {
    return NextResponse.json(
      {
        error:
          "Compiling creates an email draft, which needs fundraising access. Ask an admin, or have someone with it compile this edition.",
      },
      { status: 403 },
    );
  }

  const fields = {
    name: detail.edition.title,
    subject: subjectFor(detail.edition),
    body: result.body,
  };

  // Recompiling REWRITES the draft this edition already made rather than
  // making a second one. Two drafts of the same edition sitting on the comms
  // page is how the wrong one gets sent — and nothing here can tell which one
  // someone meant. A draft that has moved past `draft` is not ours to rewrite.
  let campaignId: string | null = null;
  if (detail.edition.email_campaign_id) {
    const { data: existing } = await supabase
      .from("email_campaigns")
      .select("id, status")
      .eq("id", detail.edition.email_campaign_id)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    if (existing && (existing as { status: string }).status !== "draft") {
      return NextResponse.json(
        { error: "That email has already started sending, so it can't be rewritten." },
        { status: 409 },
      );
    }
    if (existing) {
      const { data: updated, error: upErr } = await supabase
        .from("email_campaigns")
        .update(fields)
        .eq("id", (existing as { id: string }).id)
        .eq("org_id", ctx.orgId)
        .eq("status", "draft")
        .select("id")
        .maybeSingle();
      if (upErr) {
        console.error("[comms] edition recompile failed:", upErr.message);
        return NextResponse.json({ error: "Could not update the email draft." }, { status: 500 });
      }
      campaignId = (updated as { id: string } | null)?.id ?? null;
    }
    // No row: the draft was deleted on the comms page. Fall through and make a
    // new one rather than stranding the edition pointing at nothing.
  }

  if (!campaignId) {
    const { data: campaign, error } = await supabase
      .from("email_campaigns")
      .insert({
        org_id: ctx.orgId,
        ...fields,
        status: "draft",
        created_by: (await getAdminUser()) ?? null,
      })
      .select("id")
      .single();
    if (error || !campaign) {
      console.error("[comms] edition compile failed:", error?.message);
      return NextResponse.json({ error: "Could not create the email draft." }, { status: 500 });
    }
    campaignId = campaign.id as string;
  }

  await supabase
    .from("comms_editions")
    .update({ email_campaign_id: campaignId, status: "compiled" })
    .eq("id", params.id)
    .eq("org_id", ctx.orgId);

  await audit(req, {
    action: "comms.edition.compile",
    entityType: "comms_edition",
    entityId: params.id,
    after: { email_campaign_id: campaignId, chars: result.body.length },
  });

  return NextResponse.json({ ok: true, campaign_id: campaignId, warnings: result.warnings });
}
