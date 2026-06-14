import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import PageHeader from "../_components/PageHeader";
import StatCard from "../_components/StatCard";
import {
  ApplicationRow,
  OfferNextButton,
  type ApplicationView,
  type CohortOption,
} from "./_components/IntakeControls";
import { APP_STATUS_LABELS } from "./_lib/constants";

// Intake pipeline (Ring 3, modules/02-program.md "Intake"): screen public
// applications (eligible/ineligible), set priority tiers, run the waitlist
// (priority then first-come), send offers as seats open, and accept
// straight onto the roster + cohort.
export const dynamic = "force-dynamic";

type AppRecord = {
  id: string;
  cohort_id: string | null;
  first_name: string;
  last_name: string | null;
  grade: string | null;
  school: string | null;
  guardian_name: string | null;
  guardian_email: string | null;
  guardian_phone: string | null;
  motivation: string | null;
  referral: string | null;
  status: string;
  priority: number;
  created_at: string;
};

const SECTION_ORDER = ["new", "eligible", "waitlisted", "offered", "accepted"] as const;
const CLOSED = ["ineligible", "declined", "expired"];

export default async function IntakePage() {
  const supabase = getSupabaseAdmin();
  const [{ data: appsData }, { data: cohortsData }, { data: membersData }] = await Promise.all([
    supabase.from("applications").select("*").order("created_at", { ascending: true }),
    supabase
      .from("cohorts")
      .select("id, name, capacity, status, accepting_applications")
      .neq("status", "archived")
      .order("start_date", { ascending: false, nullsFirst: false }),
    supabase.from("cohort_members").select("cohort_id, status"),
  ]);
  const apps = (appsData ?? []) as AppRecord[];
  const cohorts = cohortsData ?? [];
  const members = membersData ?? [];

  // Waitlist order: priority tier first, then first-come (spec: priority
  // tiers + waitlist). Positions are per cohort; cohortless apps pool.
  const waitlisted = apps
    .filter((a) => a.status === "waitlisted")
    .sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
  const positionById = new Map<string, number>();
  const byPool = new Map<string, number>();
  for (const a of waitlisted) {
    const pool = a.cohort_id ?? "general";
    const pos = (byPool.get(pool) ?? 0) + 1;
    byPool.set(pool, pos);
    positionById.set(a.id, pos);
  }

  const toView = (a: AppRecord): ApplicationView => ({
    id: a.id,
    name: [a.first_name, a.last_name].filter(Boolean).join(" "),
    grade: a.grade,
    school: a.school,
    cohort_id: a.cohort_id,
    guardian_name: a.guardian_name,
    guardian_email: a.guardian_email,
    guardian_phone: a.guardian_phone,
    motivation: a.motivation,
    referral: a.referral,
    status: a.status,
    priority: a.priority,
    created_at: a.created_at,
    waitlistPosition: positionById.get(a.id) ?? null,
    cohortName: cohortName(a.cohort_id),
  });

  const cohortOptions: CohortOption[] = cohorts.map((c) => ({ id: c.id, name: c.name }));
  const cohortName = (id: string | null) =>
    id ? cohorts.find((c) => c.id === id)?.name ?? "Unknown cohort" : "General interest";

  // Per-cohort seat math drives "offer next": open seats = capacity −
  // enrolled − offers already out.
  const seatStrips = cohorts
    .map((c) => {
      const enrolled = members.filter(
        (m) => m.cohort_id === c.id && m.status === "enrolled"
      ).length;
      const offersOut = apps.filter(
        (a) => a.cohort_id === c.id && a.status === "offered"
      ).length;
      const wl = waitlisted.filter((a) => a.cohort_id === c.id);
      const openSeats =
        c.capacity !== null ? Math.max(0, c.capacity - enrolled - offersOut) : null;
      return { ...c, enrolled, offersOut, waitlist: wl, openSeats };
    })
    .filter((c) => c.accepting_applications || c.waitlist.length > 0 || c.offersOut > 0);

  const count = (s: string) => apps.filter((a) => a.status === s).length;
  const closedApps = apps.filter((a) => CLOSED.includes(a.status));

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader
        title="Intake"
        subtitle="Applications from the public form · screen → waitlist → offer → roster"
        actions={
          <a
            href="/apply"
            target="_blank"
            className="text-xs font-semibold text-cream/70 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full transition-colors"
          >
            View public form ↗
          </a>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="To screen" value={count("new")} sub="new applications" muted={count("new") === 0} />
        <StatCard label="Waitlisted" value={count("waitlisted")} muted={count("waitlisted") === 0} />
        <StatCard label="Offers out" value={count("offered")} muted={count("offered") === 0} />
        <StatCard label="Accepted" value={count("accepted")} sub="all-time" muted={count("accepted") === 0} />
      </div>

      {seatStrips.length > 0 && (
        <div className="space-y-2 mb-8">
          {seatStrips.map((c) => (
            <div
              key={c.id}
              className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2 text-[12px] text-cream/70"
            >
              <Link href={`/admin/cohorts/${c.id}`} className="font-semibold text-cream hover:text-orange">
                {c.name}
              </Link>
              {c.accepting_applications && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 uppercase tracking-wider">
                  Accepting
                </span>
              )}
              <span className="tabular-nums">
                {c.enrolled}{c.capacity ? ` / ${c.capacity}` : ""} enrolled
                {c.offersOut > 0 ? ` · ${c.offersOut} offers out` : ""}
                {c.waitlist.length > 0 ? ` · ${c.waitlist.length} waitlisted` : ""}
                {c.openSeats !== null ? ` · ${c.openSeats} open seats` : ""}
              </span>
              <span className="ml-auto" />
              {c.waitlist.length > 0 && (c.openSeats === null || c.openSeats > 0) && (
                <OfferNextButton
                  applicationId={c.waitlist[0].id}
                  name={[c.waitlist[0].first_name, c.waitlist[0].last_name].filter(Boolean).join(" ")}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-8">
        {SECTION_ORDER.map((status) => {
          const rows = apps.filter((a) => a.status === status);
          if (rows.length === 0) return null;
          const ordered =
            status === "waitlisted"
              ? waitlisted
              : [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
          return (
            <section key={status}>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70 mb-2">
                {APP_STATUS_LABELS[status]} ({rows.length})
              </h2>
              <div className="space-y-2">
                {ordered.map((a) => (
                  <ApplicationRow key={a.id} app={toView(a)} cohorts={cohortOptions} />
                ))}
              </div>
            </section>
          );
        })}

        {closedApps.length > 0 && (
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70 mb-2">
              Closed ({closedApps.length})
            </h2>
            <div className="space-y-2">
              {closedApps.map((a) => (
                <ApplicationRow key={a.id} app={toView(a)} cohorts={cohortOptions} />
              ))}
            </div>
          </section>
        )}

        {apps.length === 0 && (
          <p className="text-sm text-gray-mid">
            No applications yet. Flag a cohort as &ldquo;Accepting applications&rdquo; on its page,
            then share <span className="text-cream/80">ambitionangels.org/apply</span>.
          </p>
        )}
      </div>
    </div>
  );
}
