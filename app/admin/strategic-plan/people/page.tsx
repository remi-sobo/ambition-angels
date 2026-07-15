import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import PageHeader from "../../_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";

// Per-person views — the Performance Agreement (BloomOS Strategy, Phase 5).
// Each owner's slice of the plan: their objectives, goals, measures, and
// initiatives, with "next moves" (open initiatives + off-target measures)
// pulled to the top. Owners are the free-text owner tokens already on the plan
// rows; a shared owner like "Remi / Empathy Labs" shows under each person.
export const dynamic = "force-dynamic";

type Row = { id: string; title: string; owner: string | null; status: string };
type KpiRow = Row & { unit: string | null; target: number | null; current: number | null; goal_id: string | null; objective_id: string | null };

const splitOwners = (s: string | null): string[] =>
  (s ?? "").split(/[/,]/).map((p) => p.trim()).filter(Boolean);

const HEALTH_DOT: Record<string, string> = {
  behind: "bg-expense", at_risk: "bg-[#C8881B]", on_track: "bg-revenue", done: "bg-revenue", not_started: "bg-gray-mid",
  todo: "bg-gray-mid", in_progress: "bg-[#C8881B]",
};
const offTrack = (s: string) => s === "at_risk" || s === "behind";
const openInit = (s: string) => s !== "done";

const fmtVal = (v: number | null, unit: string | null): string => {
  if (v === null || v === undefined) return "—";
  if (unit === "$") return v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v.toLocaleString()}`;
  return `${v.toLocaleString()}${unit && unit !== "%" ? "" : unit === "%" ? "%" : ""}`;
};

export default async function StrategyPeoplePage() {
  const ctx = await getOrgContext();
  if (!ctx) return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  const orgId = ctx.orgId;
  const sb = getSupabaseAdmin();

  const [objsRes, goalsRes, kpisRes, initsRes] = await Promise.all([
    sb.from("plan_objectives").select("id, title, owner, status").eq("org_id", orgId),
    sb.from("plan_goals").select("id, title, owner, status").eq("org_id", orgId),
    sb.from("plan_kpis").select("id, title, owner, status, unit, target, current, goal_id, objective_id").eq("org_id", orgId),
    sb.from("plan_initiatives").select("id, title, owner, status").eq("org_id", orgId),
  ]);

  const objectives = (objsRes.data ?? []) as Row[];
  const goals = (goalsRes.data ?? []) as Row[];
  const kpis = (kpisRes.data ?? []) as KpiRow[];
  const initiatives = (initsRes.data ?? []) as Row[];

  // Bucket every row under each of its owners.
  const people = new Map<string, { objectives: Row[]; goals: Row[]; kpis: KpiRow[]; initiatives: Row[] }>();
  const bucket = (person: string) => {
    let p = people.get(person);
    if (!p) { p = { objectives: [], goals: [], kpis: [], initiatives: [] }; people.set(person, p); }
    return p;
  };
  for (const o of objectives) for (const who of splitOwners(o.owner)) bucket(who).objectives.push(o);
  for (const g of goals) for (const who of splitOwners(g.owner)) bucket(who).goals.push(g);
  for (const k of kpis) for (const who of splitOwners(k.owner)) bucket(who).kpis.push(k);
  for (const i of initiatives) for (const who of splitOwners(i.owner)) bucket(who).initiatives.push(i);

  const total = (p: { objectives: Row[]; goals: Row[]; kpis: KpiRow[]; initiatives: Row[] }) =>
    p.objectives.length + p.goals.length + p.kpis.length + p.initiatives.length;
  const sorted = Array.from(people.entries()).sort((a, b) => total(b[1]) - total(a[1]));

  const unowned =
    objectives.filter((o) => splitOwners(o.owner).length === 0).length +
    goals.filter((g) => splitOwners(g.owner).length === 0).length +
    kpis.filter((k) => splitOwners(k.owner).length === 0).length +
    initiatives.filter((i) => splitOwners(i.owner).length === 0).length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1000px]">
      <PageHeader
        title="People"
        subtitle={
          <>
            Each person&apos;s slice of the plan — their objectives, measures, and next moves · back to the{" "}
            <Link href="/admin/strategic-plan" className="text-orange hover:underline">full plan</Link>
          </>
        }
      />

      {sorted.length === 0 ? (
        <p className="text-sm text-ink-2">
          No owners assigned yet. Set an owner on objectives, goals, measures, or initiatives and they&apos;ll
          show up here. Start from the <Link href="/admin/strategic-plan" className="text-orange hover:underline">plan</Link>.
        </p>
      ) : (
        <div className="space-y-5">
          {sorted.map(([person, p]) => {
            const nextMoves = [
              ...p.initiatives.filter((i) => openInit(i.status)).map((i) => ({ kind: "initiative" as const, ...i })),
              ...p.kpis.filter((k) => offTrack(k.status)).map((k) => ({ kind: "kpi" as const, ...k })),
            ];
            return (
              <section key={person} className="bg-surface border-[1.5px] border-outline rounded-card-lg p-5">
                <div className="flex flex-wrap items-baseline gap-2 mb-3">
                  <h2 className={TYPE.sectionTitle}>{person}</h2>
                  <span className="text-[11px] text-ink-2">
                    {p.objectives.length} obj · {p.goals.length} goals · {p.kpis.length} measures · {p.initiatives.length} initiatives
                  </span>
                </div>

                {nextMoves.length > 0 && (
                  <div className="mb-4">
                    <div className={`${TYPE.sectionHeader} mb-1.5`}>Next moves</div>
                    <ul className="space-y-1">
                      {nextMoves.slice(0, 8).map((m) => (
                        <li key={`${m.kind}-${m.id}`} className="flex items-center gap-2 text-sm">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${HEALTH_DOT[m.status] ?? "bg-gray-mid"}`} />
                          <span className="text-ink-1 truncate min-w-0">{m.title}</span>
                          <span className="text-[10px] text-ink-2 flex-shrink-0">
                            {m.kind === "kpi" ? `measure · ${m.status === "behind" ? "behind" : "at risk"}` : "initiative"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {p.objectives.length > 0 && (
                    <PersonList label="Objectives" rows={p.objectives.map((o) => ({ id: o.id, title: o.title, status: o.status }))} />
                  )}
                  {p.goals.length > 0 && (
                    <PersonList label="Goals" rows={p.goals.map((g) => ({ id: g.id, title: g.title, status: g.status }))} />
                  )}
                  {p.kpis.length > 0 && (
                    <PersonList
                      label="Measures"
                      rows={p.kpis.map((k) => ({
                        id: k.id,
                        title: k.title,
                        status: k.status,
                        meta: `${fmtVal(k.current, k.unit)}${k.target !== null ? ` / ${fmtVal(k.target, k.unit)}` : ""}`,
                      }))}
                    />
                  )}
                  {p.initiatives.length > 0 && (
                    <PersonList label="Initiatives" rows={p.initiatives.map((i) => ({ id: i.id, title: i.title, status: i.status }))} />
                  )}
                </div>
              </section>
            );
          })}

          {unowned > 0 && (
            <p className="text-xs text-ink-3">
              {unowned} plan item{unowned === 1 ? "" : "s"} have no owner — assign owners on the plan so nothing is unaccounted for.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PersonList({
  label,
  rows,
}: {
  label: string;
  rows: { id: string; title: string; status: string; meta?: string }[];
}) {
  return (
    <div>
      <div className={`${TYPE.sectionHeader} mb-1`}>{label}</div>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${HEALTH_DOT[r.status] ?? "bg-gray-mid"}`} />
            <span className="text-ink-1 truncate min-w-0 flex-1">{r.title}</span>
            {r.meta && <span className="text-[10px] text-ink-2 tabular-nums flex-shrink-0">{r.meta}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
