import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";
import { deriveAssigneeOptions } from "@/lib/admin/assignees";
import { loadGiftTableSpine } from "@/lib/fundraising/gift-table-server";
import { TYPE } from "@/lib/admin/typeScale";
import {
  Alert,
  Badge,
  Card,
  PageHeader,
  PageSection,
  PageShell,
  StatCard,
} from "@/app/admin/_components/ui";
import {
  formatGiftMoney,
  type ClosedSnapshot,
  type GiftTable,
  hasPledgedStage,
  hasStaleCloseDate,
  isEstimated,
  placementState,
  placementTarget,
  possibleMatches,
  workGroups,
  suggestAffinity,
  suggestCapacity,
  tableShapeOverTerm,
  valueContext,
  verdict,
} from "@/lib/fundraising/gift-table";
import { GiftTableSettings, LevelsEditor, StatusControl } from "./_components/GiftTableEditor";
import LevelDrawer, { type PlacementView } from "./_components/LevelDrawer";
import PossibleMatches, { type MatchRow } from "./_components/PossibleMatches";
import WorkCards from "./_components/WorkCards";
import CloseControls from "./_components/CloseControls";
import PlanVsActual from "./_components/PlanVsActual";

/**
 * One gift table (specs/fundraising-gift-tables.md, Phase 2).
 *
 * The route is nested under Campaigns ON PURPOSE. The shell resolves both the
 * destination and the tab row by href PREFIX (lib/admin/v2shellNav.ts,
 * V2TabZone), so a sibling route like /admin/fundraising/gift-tables/[id]
 * would render with no tab row and no sidebar highlight at all. Nesting makes
 * "no new tab, Campaigns active" true structurally — nav.ts, v2routes.ts and
 * next.config.mjs are untouched by this phase.
 *
 * Phase 2 shows the shape and the verdict. Names are zero until Phase 3 puts
 * placements under the levels, and the work cards arrive with them in Phase 4
 * — so what renders here is a table that can already be argued with, and
 * cannot yet be worked.
 */
export const dynamic = "force-dynamic";

const BASIS_LABEL: Record<GiftTable["coverageBasis"], string> = {
  window: "Window",
  annual: "Per year",
  full_term: "Full term",
};

const BASIS_HINT: Record<GiftTable["coverageBasis"], string> = {
  window: "Every figure counts what lands inside this window.",
  annual: "Every figure counts one year. Multi-year totals are labelled separately.",
  full_term: "Every figure counts the whole term of the commitment.",
};

export default async function GiftTablePage({ params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <PageShell>
        <PageHeader title="Gift table" subtitle="Sign in to view this gift table." />
      </PageShell>
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const supabase = createServerSupabase();
  // The spine — table, levels, placements, credits, stage roles, and every
  // derived number — comes from ONE loader shared with the close action and
  // the workbook export (lib/fundraising/gift-table-server.ts). Three readers
  // of the same figures is exactly how the spreadsheets this replaced drifted,
  // so none of them computes a level's value on its own.
  const [spine, canWrite, members] = await Promise.all([
    loadGiftTableSpine(supabase, ctx.orgId, params.id),
    hasPermission(supabase, ctx.orgId, "fundraising.write"),
    supabase
      .from("memberships")
      .select("role, profile:profiles ( display_name )")
      .eq("org_id", ctx.orgId),
  ]);
  if (!spine) notFound();
  const { table, levels, placements, credits, roles, stages, goal, shape, slots } = spine;
  const g = spine.gaps;

  // The close snapshot is jsonb, so it is whatever was written — including
  // nothing, or something an older shape wrote. It is shaped-checked rather
  // than trusted: a table whose history cannot be read should still render.
  const raw = table.closedSnapshot;
  const closedSnapshot =
    raw && typeof raw === "object" && Array.isArray((raw as ClosedSnapshot).levels)
      ? (raw as ClosedSnapshot)
      : null;

  // A closed or archived table is frozen: the edit route rejects every write
  // with a 409 so the snapshot cannot disagree with the rows it was taken
  // from. The page has to agree, or it offers controls that only fail.
  const frozen = table.status === "closed" || table.status === "archived";
  const canEdit = canWrite && !frozen;

  const ctxValue = valueContext(table);

  const termYears = Math.max(
    table.defaultTermYears,
    ...levels.map((l) => l.termYears ?? table.defaultTermYears),
  );
  const showTerm = table.coverageBasis === "annual" && termYears > 1;

  // Suggested capacity and affinity, from giving history, for the placed
  // names only — a bounded read, not the whole gift table. Always LABELLED
  // with where the number came from: EPA scores capacity from a wealth
  // estimate and AA from largest gift, and a bare 5 that doesn't say which
  // will be believed by someone who shouldn't.
  const placedIds = Array.from(new Set(placements.map((p) => p.constituentId)));
  const { data: giftRows } = placedIds.length
    ? await supabase
        .from("gifts")
        .select("id, constituent_id, amount, gift_date")
        .eq("org_id", ctx.orgId)
        .in("constituent_id", placedIds)
    : { data: [] as Array<{ id: string; constituent_id: string; amount: number; gift_date: string }> };
  const giftStats = new Map<string, { largest: number; years: number }>();
  const yearsSeen = new Map<string, Set<number>>();
  for (const g of (giftRows ?? []) as Array<{
    id: string;
    constituent_id: string;
    amount: number;
    gift_date: string;
  }>) {
    const prev = giftStats.get(g.constituent_id) ?? { largest: 0, years: 0 };
    prev.largest = Math.max(prev.largest, Number(g.amount));
    giftStats.set(g.constituent_id, prev);
    const set = yearsSeen.get(g.constituent_id) ?? new Set<number>();
    set.add(Number(g.gift_date.slice(0, 4)));
    yearsSeen.set(g.constituent_id, set);
  }
  for (const [id, set] of Array.from(yearsSeen.entries())) {
    const stat = giftStats.get(id);
    if (stat) stat.years = set.size;
  }

  // Assignee options come from the org's memberships, never a hardcoded list
  // (lib/admin/assignees.ts; tenant_neutral_assignees.sql dropped the old
  // Remi/Shannon check constraints for exactly this reason).
  const owners = deriveAssigneeOptions(
    ((members as { data?: Array<{ role: string | null; profile?: { display_name?: string } | null }> })
      ?.data ?? [])
      .map((m) => ({ displayName: m.profile?.display_name ?? "", role: m.role }))
      .filter((m) => m.displayName),
  );

  const today = new Date().toISOString().slice(0, 10);
  const viewsByLevel = new Map<string, PlacementView[]>();
  for (const p of placements) {
    const state = placementState(p, roles);
    if (state === "removed") continue;
    const list = viewsByLevel.get(p.levelId) ?? [];
    list.push({
      id: p.id,
      constituentId: p.constituentId,
      displayName: p.displayName,
      householdId: p.householdId,
      state,
      targetAmount: placementTarget(p),
      linked: !!p.opportunity,
      staleClose: hasStaleCloseDate(p, today),
      doNotContact: p.doNotContact,
      capacityScore: p.capacityScore,
      affinityScore: p.affinityScore,
      connectionScore: p.connectionScore,
      readinessScore: p.readinessScore,
      warmPath: p.warmPath,
      whyNote: null,
      nextStep: p.nextStep,
      nextStepDue: p.nextStepDue,
      owner: p.owner,
      capacityHint: suggestCapacity(giftStats.get(p.constituentId)?.largest ?? null)?.source ?? null,
      affinityHint: suggestAffinity(giftStats.get(p.constituentId)?.years ?? 0)?.source ?? null,
    });
    viewsByLevel.set(p.levelId, list);
  }

  // Possible matches: in-window money from a placed household that no
  // opportunity, campaign or credit row ties to this table.
  const nameById = new Map(placements.map((p) => [p.constituentId, p.displayName]));
  const matches: MatchRow[] = possibleMatches({
    // The real gift id: Attach writes a credit row whose source_id the
    // org-match trigger resolves in `gifts`, so a synthetic key would be
    // rejected at the database.
    money: ((giftRows ?? []) as Array<{
      id: string;
      constituent_id: string;
      amount: number;
      gift_date: string;
    }>).map((gft) => ({
      id: gft.id,
      sourceType: "gift" as const,
      constituentId: gft.constituent_id,
      amount: Number(gft.amount),
      occurredOn: gft.gift_date,
      campaignId: null,
    })),
    placements,
    credits,
    window: { startsOn: table.startsOn, endsOn: table.endsOn },
    tableCampaignId: table.campaignId,
  }).map((m) => ({
    sourceType: m.row.sourceType,
    sourceId: m.row.id,
    label: nameById.get(m.row.constituentId ?? "") ?? "A placed donor",
    amount: m.row.amount,
    occurredOn: m.row.occurredOn,
    reason: m.reason,
  }));

  // Work the table. Only an active table produces any: workGroups() returns
  // empty for every other status, so a draft puts nothing in anyone's queue.
  const { data: duePledges } = table.status === "active"
    ? await supabase
        .from("pledge_payments")
        .select("id, due_date, expected_amount, pledge:pledges ( constituent_id )")
        .eq("org_id", ctx.orgId)
        .eq("status", "scheduled")
        .lte("due_date", new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10))
        .limit(100)
    : { data: [] as unknown[] };

  const placedSet = new Set(placements.map((p) => p.constituentId));
  const work = workGroups({
    table,
    slots,
    placements,
    roles,
    pledgeDue: ((duePledges ?? []) as unknown as Array<{
      id: string;
      due_date: string;
      expected_amount: number;
      pledge: { constituent_id: string | null } | null;
    }>)
      // Only money owed by someone on THIS table. A pledge from a household
      // nobody placed is not this table's work.
      .filter((p) => p.pledge?.constituent_id && placedSet.has(p.pledge.constituent_id))
      .map((p) => ({
        id: p.id,
        label: nameById.get(p.pledge!.constituent_id as string) ?? "A placed donor",
        amount: Number(p.expected_amount),
        dueOn: p.due_date,
      })),
    renewals: [],
    today,
  });

  const verdictText = levels.length
    ? verdict({ table, shape, goal, gaps: g, uncreditedPledged: null })
    : "No levels yet. A gift table starts with the shape of the ask: how many gifts, at what size.";

  return (
    <PageShell>
      <PageHeader
        eyebrow={
          <Link href="/admin/fundraising/campaigns" className="hover:text-ink-1 transition-colors">
            ← Campaigns
          </Link>
        }
        title={table.name}
        subtitle={
          <>
            {table.startsOn} → {table.endsOn} ·{" "}
            <span title={BASIS_HINT[table.coverageBasis]}>
              {BASIS_LABEL[table.coverageBasis]} basis
            </span>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {/* A plain anchor, NOT next/link, and the same shape every other
                export in the app uses. A client Link prefetches on hover and
                intercepts the click, which here would run the pool queries and
                write an export audit row for a file nobody ever receives. */}
            <a
              href={`/api/admin/fundraising/gift-tables/${table.id}/export`}
              download
              className="inline-flex items-center justify-center rounded-control text-[13px] font-semibold h-8 px-3 bg-surface text-ink-1 border border-hairline hover:bg-tile hover:border-outline transition-colors"
            >
              Export workbook
            </a>
            {canWrite ? (
              <>
                <StatusControl id={table.id} status={table.status} />
                <CloseControls id={table.id} status={table.status} />
              </>
            ) : (
              <Badge tone={table.status === "active" ? "success" : "neutral"}>{table.status}</Badge>
            )}
          </div>
        }
      />

      {/* The verdict, first. Not the spreadsheet — the single worst true
          thing about this table, in a sentence. */}
      <Card tone={g.unfilledSlots > 0 ? "attention" : "default"} className="mb-6">
        <p className={`${TYPE.body} leading-relaxed`}>{verdictText}</p>
        {table.status === "draft" && levels.length > 0 && (
          <p className={`${TYPE.metadata} mt-2`}>
            This table is a draft. It feeds no queues and creates no work until it goes active.
          </p>
        )}
      </Card>

      {closedSnapshot && (
        <div className="mb-6">
          <PlanVsActual
            snapshot={closedSnapshot}
            slots={slots}
            liveGoal={goal}
            liveShape={shape}
          />
        </div>
      )}

      {table.status === "active" && (
        <div className="mb-6">
          <WorkCards work={work} />
        </div>
      )}

      {/* Two numbers, labelled, never merged. Overshoot is normal: gifts
          arrive in sensible bands, not in amounts that sum to a target. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Table goal"
          value={formatGiftMoney(goal)}
          sub={`${formatGiftMoney(table.target)} × ${table.multiplier}${table.goalRoundTo ? `, rounded to ${table.goalRoundTo.toLocaleString("en-US")}` : ""}`}
        />
        <StatCard
          label={`Table shape · ${BASIS_LABEL[table.coverageBasis].toLowerCase()}`}
          value={formatGiftMoney(shape)}
          sub={
            shape >= goal
              ? `${formatGiftMoney(shape - goal)} above the goal`
              : `${formatGiftMoney(goal - shape)} below the goal`
          }
        />
        <StatCard
          label="Prospects needed"
          value={slots.reduce((s, x) => s + x.needed, 0)}
          sub={`${levels.reduce((s, l) => s + l.giftsNeeded, 0)} gifts across ${levels.length} level${levels.length === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Names placed"
          value={slots.reduce((s, x) => s + x.placed, 0)}
          sub="placements arrive in Phase 3"
          muted
        />
      </div>

      {showTerm && (
        <p className={`${TYPE.metadata} mt-3`}>
          Over {termYears} years, held flat: shape {formatGiftMoney(tableShapeOverTerm(levels, table, termYears))} ·
          goal {formatGiftMoney(goal * termYears)}. Kept separate on purpose: commitments are held
          flat, so neither number is the other multiplied.
        </p>
      )}

      {!hasPledgedStage(stages) && (
        <Alert tone="warning" className="mt-6">
          No pledged stage is configured for this org, so money that has been promised but not
          collected can&apos;t be told apart from an ordinary open ask. Set{" "}
          <code>counts_as_pledged</code> on the stage that means &ldquo;committed, not yet
          collected&rdquo;.
        </Alert>
      )}

      <PageSection title="The shape">
        {levels.length === 0 ? (
          <Card>
            <p className={TYPE.bodyMuted}>
              No levels yet. Add the first one below: gift size, how many gifts you need at that
              size, and how many qualified prospects it takes to close one.
            </p>
          </Card>
        ) : (
          <Card padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-hairline">
                    <th className={`${TYPE.tableHeader} px-4 py-3`}>Level</th>
                    <th className={`${TYPE.tableHeader} px-4 py-3`}>Gift size</th>
                    <th className={`${TYPE.tableHeader} px-4 py-3`}>What it buys</th>
                    <th className={`${TYPE.tableHeader} px-4 py-3 text-right`}>Gifts</th>
                    <th className={`${TYPE.tableHeader} px-4 py-3 text-right`}>Total</th>
                    <th className={`${TYPE.tableHeader} px-4 py-3 text-right`}>Prospects</th>
                    <th className={`${TYPE.tableHeader} px-4 py-3 text-right`}>Names</th>
                    <th className={`${TYPE.tableHeader} px-4 py-3 text-right`}>Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((s) => {
                    const l = s.level;
                    const native =
                      l.cadence === "monthly"
                        ? `${formatGiftMoney(l.amount)}/mo`
                        : l.cadence === "annual"
                          ? `${formatGiftMoney(l.amount)}/yr`
                          : formatGiftMoney(l.amount);
                    // The native amount is ALWAYS visible; the basis value
                    // only appears when it differs, and says so.
                    const derived = s.value !== l.amount ? formatGiftMoney(s.value) : null;
                    return (
                      <tr key={l.id} className="border-b border-hairline last:border-0">
                        <td className={`${TYPE.body} px-4 py-3 font-medium`}>{l.label}</td>
                        <td className={`${TYPE.body} px-4 py-3 tabular-nums`}>
                          {native}
                          {derived && (
                            <span className={`${TYPE.metadata} block`}>
                              {derived} on this table
                              {isEstimated(l, ctxValue) ? " · estimated" : ""}
                            </span>
                          )}
                        </td>
                        <td className={`${TYPE.bodyMuted} px-4 py-3`}>{l.purpose ?? "—"}</td>
                        <td className={`${TYPE.body} px-4 py-3 text-right tabular-nums`}>
                          {l.giftsNeeded}
                        </td>
                        <td className={`${TYPE.body} px-4 py-3 text-right tabular-nums`}>
                          {formatGiftMoney(s.value * l.giftsNeeded)}
                        </td>
                        <td className={`${TYPE.body} px-4 py-3 text-right tabular-nums`}>
                          {s.needed}
                          <span className={`${TYPE.metadata} block`}>
                            {l.prospectsPerGift} per gift
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <LevelDrawer
                            tableId={table.id}
                            levelId={l.id}
                            levelLabel={l.label}
                            needed={s.needed}
                            placements={viewsByLevel.get(l.id) ?? []}
                            owners={owners}
                            canWrite={canEdit}
                          />
                        </td>
                        <td
                          className={`px-4 py-3 text-right tabular-nums ${
                            s.gap > 0 ? "text-status-critical-text font-semibold" : TYPE.bodyMuted
                          }`}
                        >
                          {s.gap}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-tile">
                    <td className={`${TYPE.body} px-4 py-3 font-semibold`}>Total</td>
                    <td />
                    <td />
                    <td className={`${TYPE.body} px-4 py-3 text-right tabular-nums font-semibold`}>
                      {levels.reduce((s, l) => s + l.giftsNeeded, 0)}
                    </td>
                    <td className={`${TYPE.body} px-4 py-3 text-right tabular-nums font-semibold`}>
                      {formatGiftMoney(shape)}
                    </td>
                    <td className={`${TYPE.body} px-4 py-3 text-right tabular-nums font-semibold`}>
                      {slots.reduce((s, x) => s + x.needed, 0)}
                    </td>
                    <td className={`${TYPE.body} px-4 py-3 text-right tabular-nums font-semibold`}>
                      {slots.reduce((s, x) => s + x.placed, 0)}
                    </td>
                    <td className={`${TYPE.body} px-4 py-3 text-right tabular-nums font-semibold`}>
                      {g.unfilledSlots}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className={`${TYPE.metadata} px-4 py-3 border-t border-hairline`}>
              Gap is prospects needed minus names placed, never below zero, per level. Read it
              instead of the total: a surplus at the top of the table does not fill a slot further
              down. {g.overallShort} name{g.overallShort === 1 ? "" : "s"} short overall,{" "}
              {g.unfilledSlots} slot{g.unfilledSlots === 1 ? "" : "s"} unfilled across levels.
            </p>
          </Card>
        )}
      </PageSection>

      {matches.length > 0 && (
        <PageSection title="Possible matches">
          <PossibleMatches tableId={table.id} matches={matches} canWrite={canEdit} />
        </PageSection>
      )}

      {canEdit && (
        <>
          <PageSection title="Edit the levels">
            <LevelsEditor
              tableId={table.id}
              levels={levels.map((l) => ({
                id: l.id,
                label: l.label,
                amount: l.amount,
                cadence: l.cadence,
                term_years: l.termYears,
                gifts_needed: l.giftsNeeded,
                prospects_per_gift: l.prospectsPerGift,
                purpose: l.purpose ?? "",
              }))}
            />
          </PageSection>

          <PageSection title="Settings">
            <GiftTableSettings
              table={{
                id: table.id,
                name: table.name,
                starts_on: table.startsOn,
                ends_on: table.endsOn,
                target: table.target,
                multiplier: table.multiplier,
                goal_round_to: table.goalRoundTo,
                coverage_basis: table.coverageBasis,
                default_term_years: table.defaultTermYears,
                monthly_modeled_years: table.monthlyModeledYears,
                target_rationale: table.targetRationale ?? "",
                multiplier_rationale: table.multiplierRationale ?? "",
                notes: table.notes ?? "",
              }}
            />
          </PageSection>
        </>
      )}

      {(table.targetRationale || table.multiplierRationale) && (
        <PageSection title="Why these numbers">
          <Card className="space-y-3">
            {table.targetRationale && (
              <div>
                <p className={TYPE.cardLabel}>Target · {formatGiftMoney(table.target)}</p>
                <p className={`${TYPE.body} mt-1 whitespace-pre-line`}>{table.targetRationale}</p>
              </div>
            )}
            {table.multiplierRationale && (
              <div>
                <p className={TYPE.cardLabel}>Multiplier · {table.multiplier}</p>
                <p className={`${TYPE.body} mt-1 whitespace-pre-line`}>
                  {table.multiplierRationale}
                </p>
              </div>
            )}
          </Card>
        </PageSection>
      )}
    </PageShell>
  );
}
