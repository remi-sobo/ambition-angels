import { notFound } from "next/navigation";
import PageShell from "../../../_components/ui/PageShell";
import PageHeader from "../../../_components/PageHeader";
import Card, { CardHeader } from "../../../_components/ui/Card";
import NextStepBar from "../../../_components/ui/NextStepBar";
import Badge from "../../../_components/ui/Badge";
import { requirePagePermission } from "../../../_components/PermissionGate";
import { ctxHasPermission } from "@/lib/admin/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadEdition } from "@/lib/admin/comms/editions-server";
import { loadBankStories } from "@/lib/admin/comms/bank-server";
import { storyVerdicts } from "@/lib/comms/story-gate";
import { EDITION_STATUS_LABEL, isEditionStatus } from "@/lib/comms/formats";
import { TYPE } from "@/lib/admin/typeScale";
import { CompilePanel, SlotEditor, type StoryOption } from "../../_components/EditionControls";
import type { SegmentOption } from "../../_components/AudienceBuilder";

/**
 * One edition (V4 Stage D): fill the slots from the story bank, choose who
 * it goes to with a live count, and compile it into an email draft on the
 * Gmail sender. Story slots offer every story but only usable ones can be
 * picked; a story whose consent lapsed after it was placed shows why, and
 * compile refuses it.
 */
export const dynamic = "force-dynamic";

export default async function EditionPage({ params }: { params: { id: string } }) {
  const gate = await requirePagePermission("comms.manage", "Comms", { entitlement: "modules.comms" });
  if (!gate.ok) return gate.page;
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const ctx = gate.ctx;
  const db = getSupabaseAdmin();
  const canSee = await ctxHasPermission(ctx, "comms.subjects.read");
  const detail = await loadEdition(db, ctx.orgId, params.id);
  if (!detail) notFound();
  const { edition, slots, completeness } = detail;

  const placed = slots.map((s) => s.story_id).filter((v): v is string => !!v);
  const [bank, verdicts, segRes, campaignRes] = await Promise.all([
    loadBankStories(db, ctx.orgId, canSee),
    storyVerdicts(db, ctx.orgId, placed),
    db.from("segments").select("id, name, definition").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(100),
    edition.email_campaign_id
      ? db.from("email_campaigns").select("id, status, segment_id").eq("org_id", ctx.orgId).eq("id", edition.email_campaign_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const options: StoryOption[] = bank.stories.map((s) => ({ id: s.id, title: s.title, publishable: s.publishable, reason: s.blocked_reason }));
  // A placed story that is no longer in the bank list (retired) still shows.
  for (const id of placed) {
    if (!options.some((o) => o.id === id)) {
      const v = verdicts.get(id);
      options.push({ id, title: v?.title || "A story", publishable: !!v?.publishable, reason: v?.reason ?? null });
    }
  }
  const blocked = [
    ...completeness.requiredMissing.map((l) => `"${l}" is required and still empty.`),
    ...placed.map((id) => verdicts.get(id)).filter((v) => v && !v.publishable).map((v) => `"${v!.title}": ${v!.reason}`),
  ];
  const campaign = campaignRes.data as { id: string; status: string; segment_id: string | null } | null;
  const locked = edition.status === "sent" || (!!campaign && campaign.status !== "draft");
  const statusLabel = isEditionStatus(edition.status) ? EDITION_STATUS_LABEL[edition.status] : edition.status;

  const step = locked
    ? null
    : blocked.length > 0
      ? `Fill ${completeness.requiredMissing.length > 0 ? "the required slots" : "the slots"} with usable stories`
      : campaign
        ? "Review and send it from Emails"
        : "Choose who it goes to, then make the email draft";

  return (
    <PageShell>
      <PageHeader
        title={edition.title}
        breadcrumb={[{ label: "Comms", href: "/admin/comms/home" }, { label: "Editions", href: "/admin/comms/editions" }]}
        chips={<Badge tone={edition.status === "sent" ? "success" : edition.status === "compiled" ? "accent" : "neutral"}>{statusLabel}</Badge>}
      />
      <NextStepBar title={step} meta={`${detail.format?.name ?? "Format"} · ${completeness.label}`} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <Card className="lg:col-span-2">
          <CardHeader title="Slots" hint="Only stories with approval and consent on file can be picked." />
          <ul className="divide-y divide-hairline">
            {slots.map((s) => (
              <SlotEditor
                key={s.slot_key}
                editionId={edition.id}
                locked={locked}
                stories={options}
                slot={{ slot_key: s.slot_key, label: s.slot_def.label, kind: s.slot_def.kind, required: s.slot_def.required, hint: s.slot_def.hint, story_id: s.story_id, content: s.content }}
              />
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Send it" hint="Who it goes to, with a live count" />
          <CompilePanel
            editionId={edition.id}
            segments={(segRes.data ?? []) as SegmentOption[]}
            segmentId={campaign?.segment_id ?? null}
            campaignId={campaign?.id ?? null}
            campaignStatus={campaign?.status ?? null}
            blocked={blocked}
            canCompile={completeness.canCompile}
          />
          <p className={`${TYPE.metadata} mt-3`}>Each send and open lands on the donor&rsquo;s record.</p>
        </Card>
      </div>
    </PageShell>
  );
}
