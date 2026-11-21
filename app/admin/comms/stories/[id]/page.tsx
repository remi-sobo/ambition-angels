import { notFound } from "next/navigation";
import PageShell from "../../../_components/ui/PageShell";
import PageHeader from "../../../_components/PageHeader";
import Card, { CardHeader } from "../../../_components/ui/Card";
import NextStepBar from "../../../_components/ui/NextStepBar";
import Notice from "../../../_components/ui/Notice";
import { ButtonLink } from "../../../_components/ui/Button";
import { requirePagePermission } from "../../../_components/PermissionGate";
import { ctxHasPermission } from "@/lib/admin/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadStory } from "@/lib/admin/comms/bank-server";
import { TYPE } from "@/lib/admin/typeScale";
import StoryChip from "../../_components/StoryChips";
import { AddSubjectButton, EditStoryButton, StatusButton, SubjectConsent } from "../../_components/StoryControls";

/**
 * One story (V4 Stage D; Detail archetype). The next-step bar says what
 * stands between this story and an email, in words: approval, then consent
 * for every identifiable person. The consent panel is where that is fixed.
 */
export const dynamic = "force-dynamic";

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

export default async function StoryPage({ params }: { params: { id: string } }) {
  const gate = await requirePagePermission("comms.manage", "Comms", { entitlement: "modules.comms" });
  if (!gate.ok) return gate.page;
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const ctx = gate.ctx;
  const canSee = await ctxHasPermission(ctx, "comms.subjects.read");
  const story = await loadStory(getSupabaseAdmin(), ctx.orgId, params.id, canSee);
  if (!story) notFound();

  const needsApproval = story.status === "raw" || story.status === "drafted";
  const consentBlocked = story.consent_state !== null && !["current", "expiring"].includes(story.consent_state);
  const step = story.status === "retired"
    ? null
    : consentBlocked
      ? needsApproval ? "Approve it, and get consent on file" : "Get consent on file"
      : needsApproval ? "Read it and approve it" : "Use it in an edition";

  const people = story.subjects;
  const hasRedacted = people.some((p) => p.redacted);

  return (
    <PageShell>
      <PageHeader
        title={story.title}
        breadcrumb={[{ label: "Comms", href: "/admin/comms/home" }, { label: "Stories", href: "/admin/comms/stories" }]}
        chips={<StoryChip status={story.status} consent_state={story.consent_state} publishable={story.publishable} />}
        secondaryActions={<EditStoryButton story={story} />}
        primaryAction={
          story.publishable ? (
            <ButtonLink href={`/admin/comms/editions?story=${story.id}`} variant="primary">Use in an edition</ButtonLink>
          ) : needsApproval ? (
            <StatusButton storyId={story.id} to="approved" label="Approve" variant="primary" />
          ) : undefined
        }
      />

      <NextStepBar
        title={step}
        meta={
          story.publishable
            ? "Approved, and everyone in it has consent on file as of now. It can go in an edition."
            : <span data-testid="story-blocked-reason">Why it can&rsquo;t be used yet: {story.blocked_reason}</span>
        }
      />

      {consentBlocked && (
        <Notice tone="warning" className="mb-4" title="This story names or shows a participant.">
          It cannot be used in any edition, email or draft until a guardian&rsquo;s consent is on file. The server refuses it everywhere, not only on this page.
        </Notice>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader title="What happened" hint={`${story.captured_by ? `Captured by ${story.captured_by} · ` : ""}${fmtDay(story.created_at)}${story.source === "reed" ? " · from Talk to log" : ""}`} />
            {story.body ? <p className={`${TYPE.body} whitespace-pre-line`}>{story.body}</p> : <p className={TYPE.bodyMuted}>No words yet.</p>}
            {story.outcome && (
              <div className="mt-4 border-t border-hairline pt-3">
                <p className={`${TYPE.cardLabel} mb-1`}>What changed because of it</p>
                <p className={`${TYPE.body} whitespace-pre-line`}>{story.outcome}</p>
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Photos" hint={story.media.length ? `${story.media.length} on file, location data removed` : undefined} />
            {story.media.length === 0 ? (
              <p className={TYPE.bodyMuted}>No photos. Add one when you capture a story.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {story.media.map((m) => (
                  <li key={m.id}>
                    <a href={`/api/admin/comms/media/${m.id}/url`} className="text-sm font-semibold text-orange underline underline-offset-2" target="_blank" rel="noreferrer">
                      {m.caption || "Open photo"}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="People in this story" action={story.status !== "retired" ? <AddSubjectButton storyId={story.id} canAddParticipant={canSee} /> : undefined} />
            {people.length === 0 ? (
              <p className={TYPE.bodyMuted}>No one recorded. A story about the work itself needs only approval.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {people.map((p) => (
                  <SubjectConsent key={p.id} subject={p} canManage={p.subject_type !== "participant" || canSee} />
                ))}
              </ul>
            )}
            {hasRedacted && (
              <p className={`${TYPE.metadata} mt-2`}>Names of participants are shown only to owners and admins.</p>
            )}
          </Card>
          <Card>
            <CardHeader title="Status" />
            <div className="flex flex-wrap gap-2">
              {story.status === "approved" && <StatusButton storyId={story.id} to="raw" label="Back to draft" variant="quiet" />}
              {story.status !== "retired" ? (
                <StatusButton storyId={story.id} to="retired" label="Retire" variant="quiet" />
              ) : (
                <StatusButton storyId={story.id} to="raw" label="Bring back" variant="quiet" />
              )}
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
