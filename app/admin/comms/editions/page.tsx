import PageShell from "../../_components/ui/PageShell";
import PageHeader from "../../_components/PageHeader";
import Card from "../../_components/ui/Card";
import ListRow, { ListRows } from "../../_components/ui/ListRow";
import Badge from "../../_components/ui/Badge";
import Notice from "../../_components/ui/Notice";
import EmptyState from "../../_components/EmptyState";
import { requirePagePermission } from "../../_components/PermissionGate";
import { ctxHasPermission } from "@/lib/admin/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadEditions, loadFormats } from "@/lib/admin/comms/editions-server";
import { loadStory } from "@/lib/admin/comms/bank-server";
import { EDITION_STATUS_LABEL, isEditionStatus } from "@/lib/comms/formats";
import { TYPE } from "@/lib/admin/typeScale";
import { NewEditionButton, PutStoryHere } from "../_components/EditionControls";

/**
 * Comms → Editions (V4 Stage D). Newsletters compiled from stories into the
 * existing Gmail sender. With ?story=<id> (from a story's "Use in an
 * edition"), each open edition offers its first empty story slot.
 */
export const dynamic = "force-dynamic";

const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function EditionsPage({ searchParams = {} }: { searchParams?: Record<string, string | undefined> }) {
  const gate = await requirePagePermission("comms.manage", "Comms", { entitlement: "modules.comms" });
  if (!gate.ok) return gate.page;
  const ctx = gate.ctx;
  const db = getSupabaseAdmin();
  const storyParam = searchParams.story && /^[0-9a-f-]{36}$/i.test(searchParams.story) ? searchParams.story : null;
  const [editions, formats, story] = await Promise.all([
    loadEditions(db, ctx.orgId),
    loadFormats(db, ctx.orgId),
    storyParam ? loadStory(db, ctx.orgId, storyParam, await ctxHasPermission(ctx, "comms.subjects.read")) : Promise.resolve(null),
  ]);
  const open = editions.filter((e) => e.status !== "sent" && e.status !== "archived");
  const sent = editions.filter((e) => e.status === "sent");

  // First empty story slot per open edition, for the hand-off.
  const emptySlot = new Map<string, string>();
  if (story?.publishable && open.length > 0) {
    const { data: slots } = await db
      .from("comms_edition_slots")
      .select("edition_id, slot_key, slot_def, story_id, content, position")
      .eq("org_id", ctx.orgId)
      .in("edition_id", open.map((e) => e.id))
      .order("position", { ascending: true });
    for (const s of (slots ?? []) as Array<{ edition_id: string; slot_key: string; slot_def: { kind: string }; story_id: string | null; content: string | null }>) {
      if (!emptySlot.has(s.edition_id) && s.slot_def?.kind === "story" && !s.story_id && !s.content) emptySlot.set(s.edition_id, s.slot_key);
    }
  }

  const row = (e: (typeof editions)[number], handoff: boolean) => {
    const status = isEditionStatus(e.status) ? EDITION_STATUS_LABEL[e.status] : e.status;
    const slot = emptySlot.get(e.id);
    return (
      <ListRow
        key={e.id}
        href={handoff && slot ? undefined : `/admin/comms/editions/${e.id}`}
        title={e.title}
        meta={`${e.format_name} · ${e.completeness.label}${e.target_date ? ` · for ${fmtDay(e.target_date)}` : ""}`}
        actions={
          handoff && slot && story ? (
            <PutStoryHere editionId={e.id} slotKey={slot} storyId={story.id} />
          ) : (
            <Badge tone={e.status === "compiled" ? "accent" : e.status === "sent" ? "success" : "neutral"}>
              {e.status === "compiled" && e.campaign_status && e.campaign_status !== "draft" ? `Email ${e.campaign_status}` : status}
            </Badge>
          )
        }
      />
    );
  };

  return (
    <PageShell>
      <PageHeader
        title="Editions"
        subtitle="Newsletters built from your stories, sent from your Gmail"
        primaryAction={<NewEditionButton formats={formats.filter((f) => !f.is_archived).map((f) => ({ id: f.id, name: f.name }))} storyId={story?.publishable ? story.id : null} />}
      />

      {story && !story.publishable && (
        <Notice tone="warning" className="mb-4" title={`"${story.title}" can't go in an edition yet.`}>{story.blocked_reason}</Notice>
      )}
      {story?.publishable && (
        <Notice tone="info" className="mb-4" title={`Where should "${story.title}" go?`}>
          {open.some((e) => emptySlot.has(e.id))
            ? "Pick an edition below; it goes into the first empty story slot. Or start a new edition."
            : "No open edition has an empty story slot. Start a new edition."}
        </Notice>
      )}

      <Card padded={false}>
        {open.length === 0 ? (
          <div className="p-4">
            <EmptyState label="editions in progress" hint="Start one from a format. The slots tell you what each issue needs." />
          </div>
        ) : (
          <ListRows>{open.map((e) => row(e, !!story?.publishable))}</ListRows>
        )}
      </Card>

      {sent.length > 0 && (
        <>
          <h2 className={`${TYPE.sectionTitle} mt-8 mb-3`}>Sent</h2>
          <Card padded={false}>
            <ListRows>{sent.map((e) => row(e, false))}</ListRows>
          </Card>
        </>
      )}
    </PageShell>
  );
}
