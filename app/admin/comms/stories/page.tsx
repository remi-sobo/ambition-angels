import PageShell from "../../_components/ui/PageShell";
import PageHeader from "../../_components/PageHeader";
import Card from "../../_components/ui/Card";
import ListRow, { ListRows } from "../../_components/ui/ListRow";
import Notice from "../../_components/ui/Notice";
import { TabLink } from "../../_components/ui/Tabs";
import Figure, { SummaryStrip } from "../../_components/ui/Figure";
import EmptyState from "../../_components/EmptyState";
import { requirePagePermission } from "../../_components/PermissionGate";
import { ctxHasPermission } from "@/lib/admin/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadBankStories, type LoadedStory } from "@/lib/admin/comms/bank-server";
import { listKeptStoryDrafts } from "@/lib/admin/comms/capture-server";
import { TYPE } from "@/lib/admin/typeScale";
import StoryChip from "../_components/StoryChips";
import { AddStoryButton, MoveDraftsButton } from "../_components/StoryActions";

/**
 * Comms → Stories (V4 Stage D; List archetype). The story bank: what was
 * captured, who it is about (first name and last initial; "a young person"
 * for a role that may not see participants), whether consent is on file, and
 * the next step on each row.
 */
export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready to use" },
  { key: "waiting", label: "Waiting on consent" },
  { key: "approve", label: "To approve" },
  { key: "retired", label: "Retired" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

const WAITING = new Set(["none", "pending", "expired", "revoked"]);
const inView = (s: LoadedStory, v: ViewKey) =>
  v === "ready" ? s.publishable
  : v === "waiting" ? s.consent_state !== null && WAITING.has(s.consent_state)
  : v === "approve" ? s.status === "raw" || s.status === "drafted"
  : true;

function nextStep(s: LoadedStory): string {
  if (s.status === "retired") return "Retired";
  if (s.consent_state && WAITING.has(s.consent_state)) return s.consent_state === "pending" ? "Record the guardian's answer" : "Get consent on file";
  if (s.status === "raw" || s.status === "drafted") return "Read and approve";
  return "Use in an edition";
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

export default async function StoriesPage({ searchParams = {} }: { searchParams?: Record<string, string | undefined> }) {
  const gate = await requirePagePermission("comms.manage", "Comms", { entitlement: "modules.comms" });
  if (!gate.ok) return gate.page;
  const ctx = gate.ctx;
  const canSee = await ctxHasPermission(ctx, "comms.subjects.read");
  const view: ViewKey =
    searchParams.consent === "waiting" ? "waiting"
    : searchParams.status === "raw" ? "approve"
    : searchParams.ready === "1" ? "ready"
    : (VIEWS.find((v) => v.key === searchParams.view)?.key ?? "all");

  const db = getSupabaseAdmin();
  const [bank, kept] = await Promise.all([
    loadBankStories(db, ctx.orgId, canSee, { status: view === "retired" ? "retired" : null, q: searchParams.q ?? null }),
    listKeptStoryDrafts(db, ctx.orgId),
  ]);
  const all = bank.stories;
  const rows = all.filter((s) => inView(s, view));
  const count = (v: ViewKey) => (v === "retired" ? undefined : all.filter((s) => inView(s, v)).length);

  return (
    <PageShell>
      <PageHeader
        title="Stories"
        subtitle="What happened, who it's about, and whether it can be used yet"
        primaryAction={<AddStoryButton />}
      />

      {kept.length > 0 && (
        <Notice tone="info" title={`${kept.length} story ${kept.length === 1 ? "draft" : "drafts"} from Talk to log are waiting to come in.`} action={<MoveDraftsButton count={kept.length} />} className="mb-4">
          They were kept before the story bank existed. Each comes in with first name and last initial only, held until consent is on file.
        </Notice>
      )}
      {bank.error && <Notice tone="danger" title={bank.error} className="mb-4">Reload to try again.</Notice>}

      <SummaryStrip label="Story bank">
        <Figure layout="strip" label="Ready to use" value={count("ready") ?? 0} source="Approved, consent checked, as of now" />
        <Figure layout="strip" label="Waiting on consent" value={count("waiting") ?? 0} source="Names or shows someone, no live consent" />
        <Figure layout="strip" label="To approve" value={count("approve") ?? 0} source="Captured, not read yet" />
      </SummaryStrip>

      <nav aria-label="Story views" className="mb-3 flex gap-1 overflow-x-auto border-b border-hairline">
        {VIEWS.map((v) => (
          <TabLink key={v.key} href={`/admin/comms/stories${v.key === "all" ? "" : `?view=${v.key}`}`} active={view === v.key} count={count(v.key)}>
            {v.label}
          </TabLink>
        ))}
      </nav>

      <Card padded={false}>
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState label="stories here" hint="Capture one from a phone in fifteen seconds, or keep one from Talk to log." />
          </div>
        ) : (
          <ListRows>
            {rows.map((s) => {
              const who = s.subjects.filter((x) => x.subject_type !== "none").map((x) => x.display_label).join(", ");
              return (
                <ListRow
                  key={s.id}
                  href={`/admin/comms/stories/${s.id}`}
                  title={s.title}
                  meta={
                    <>
                      {who ? `About ${who} · ` : "No one identifiable · "}
                      {s.captured_by ? `${s.captured_by} · ` : ""}
                      {fmtDay(s.created_at)}
                    </>
                  }
                  context={<span className={TYPE.metadata}>Next: {nextStep(s)}</span>}
                  actions={<StoryChip status={s.status} consent_state={s.consent_state} publishable={s.publishable} />}
                />
              );
            })}
          </ListRows>
        )}
      </Card>
      <p className={`${TYPE.metadata} mt-2`}>{rows.length} {rows.length === 1 ? "story" : "stories"}</p>
    </PageShell>
  );
}
