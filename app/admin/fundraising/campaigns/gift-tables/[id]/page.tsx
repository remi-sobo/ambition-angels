import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";
import { loadPipelineConfig, stagesForPipeline } from "@/lib/fundraising/stages";
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
  gaps,
  hasPledgedStage,
  isEstimated,
  slotNames,
  stageRoles,
  tableGoal,
  tableShape,
  tableShapeOverTerm,
  valueContext,
  verdict,
  type GiftLevel,
  type GiftTable,
} from "@/lib/fundraising/gift-table";
import { GiftTableSettings, LevelsEditor, StatusControl } from "./_components/GiftTableEditor";

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

type TableRow = GiftTable & {
  target_rationale: string | null;
  multiplier_rationale: string | null;
  notes: string | null;
  campaign_id: string | null;
};

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
  // Concatenated select strings defeat PostgREST's type inference, so both
  // result sets are cast — the same shape the other fundraising pages use.
  const [{ data: rawRow }, { data: rawLevels }, canWrite, pipelineConfig] = await Promise.all([
    supabase
      .from("fr_gift_tables")
      .select(
        "id, name, starts_on, ends_on, status, target, multiplier, goal_round_to, coverage_basis, " +
          "default_term_years, monthly_modeled_years, target_rationale, multiplier_rationale, " +
          "notes, campaign_id",
      )
      .eq("id", params.id)
      .eq("org_id", ctx.orgId)
      .maybeSingle(),
    supabase
      .from("fr_gift_table_levels")
      .select("id, label, amount, cadence, term_years, gifts_needed, prospects_per_gift, purpose, sort")
      .eq("gift_table_id", params.id)
      .eq("org_id", ctx.orgId)
      .order("sort"),
    hasPermission(supabase, ctx.orgId, "fundraising.write"),
    loadPipelineConfig(supabase, ctx.orgId),
  ]);
  const row = rawRow as unknown as Record<string, unknown> | null;
  const levelRows = (rawLevels ?? []) as unknown as Record<string, unknown>[];
  if (!row) notFound();

  const table: TableRow = {
    id: row.id as string,
    name: row.name as string,
    startsOn: row.starts_on as string,
    endsOn: row.ends_on as string,
    status: row.status as GiftTable["status"],
    target: Number(row.target ?? 0),
    multiplier: Number(row.multiplier ?? 1),
    goalRoundTo: row.goal_round_to === null ? null : Number(row.goal_round_to),
    coverageBasis: row.coverage_basis as GiftTable["coverageBasis"],
    defaultTermYears: Number(row.default_term_years ?? 1),
    monthlyModeledYears: Number(row.monthly_modeled_years ?? 1),
    target_rationale: (row.target_rationale as string | null) ?? null,
    multiplier_rationale: (row.multiplier_rationale as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    campaign_id: (row.campaign_id as string | null) ?? null,
  };

  const levels: GiftLevel[] = levelRows.map((l) => ({
    id: l.id as string,
    label: l.label as string,
    amount: Number(l.amount),
    cadence: l.cadence as GiftLevel["cadence"],
    termYears: l.term_years === null ? null : Number(l.term_years),
    giftsNeeded: Number(l.gifts_needed),
    prospectsPerGift: Number(l.prospects_per_gift),
    purpose: (l.purpose as string | null) ?? null,
    sort: Number(l.sort),
  }));

  // Stage config drives placement status in Phase 3. It is read here only so
  // the page can say, honestly and early, that this tenant has no stage
  // flagged as pledged — an empty Collect card would otherwise read as
  // "nothing is owed" rather than "nothing is configured".
  const stages = stagesForPipeline(pipelineConfig, "default").map((s) => ({
    key: s.key,
    stageType: s.stageType,
    countsAsPledged: s.countsAsPledged,
  }));
  const roles = stageRoles(stages);

  const ctxValue = valueContext(table);
  const goal = tableGoal(table);
  const shape = tableShape(levels, table);
  // No placements yet — Phase 3 fetches them. Passing none is the truthful
  // input, and it is why every level reads 0 of N today.
  const slots = slotNames(levels, [], table, roles);
  const g = gaps(slots);

  const termYears = Math.max(
    table.defaultTermYears,
    ...levels.map((l) => l.termYears ?? table.defaultTermYears),
  );
  const showTerm = table.coverageBasis === "annual" && termYears > 1;

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
          canWrite ? <StatusControl id={table.id} status={table.status} /> : (
            <Badge tone={table.status === "active" ? "success" : "neutral"}>{table.status}</Badge>
          )
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
                        <td className={`${TYPE.body} px-4 py-3 text-right tabular-nums`}>
                          {s.placed}
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

      {canWrite && (
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
                target_rationale: table.target_rationale ?? "",
                multiplier_rationale: table.multiplier_rationale ?? "",
                notes: table.notes ?? "",
              }}
            />
          </PageSection>
        </>
      )}

      {(table.target_rationale || table.multiplier_rationale) && (
        <PageSection title="Why these numbers">
          <Card className="space-y-3">
            {table.target_rationale && (
              <div>
                <p className={TYPE.cardLabel}>Target · {formatGiftMoney(table.target)}</p>
                <p className={`${TYPE.body} mt-1 whitespace-pre-line`}>{table.target_rationale}</p>
              </div>
            )}
            {table.multiplier_rationale && (
              <div>
                <p className={TYPE.cardLabel}>Multiplier · {table.multiplier}</p>
                <p className={`${TYPE.body} mt-1 whitespace-pre-line`}>
                  {table.multiplier_rationale}
                </p>
              </div>
            )}
          </Card>
        </PageSection>
      )}
    </PageShell>
  );
}
