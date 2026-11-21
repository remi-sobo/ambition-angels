import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageShell from "../_components/ui/PageShell";
import Notice from "../_components/ui/Notice";
import Figure from "../_components/ui/Figure";
import LookupTalk from "./LookupTalk";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { getEntitlements, hasFeature } from "@/lib/admin/entitlements";
import { createServerSupabase } from "@/lib/supabase/server";
import { constituentName } from "@/lib/fundraising/display";
import { todayInTZ } from "@/lib/admin/ops/week";
import { cleanLookupQuery, donorFigures, mailHref, pickNextStep, telHref } from "@/lib/admin/lookup";
import { dueLabel } from "@/lib/admin/todayPanels";
import { TYPE } from "@/lib/admin/typeScale";

export const metadata: Metadata = { title: "Look someone up" };
export const dynamic = "force-dynamic";

/**
 * Look someone up (V4 Stage C, spec §10; DonorPhone.dc.html). A phone-first
 * screen reached in one tap from Today: search donors and students by name,
 * then a donor card with Call, Email and Talk to log, the next step, last
 * touch, three figures with their sources, and recent activity.
 *
 * Session client only, every read fenced to the active org, so RLS applies the
 * caller's role: donors need fundraising.read, students program.read. A
 * student result shows name and stage and links to the record; no contact
 * buttons for a minor. Targets are 44px; the column never exceeds 390px of
 * content on a phone (max-w-[640px] on desktop).
 */

type Search = { q?: string; donor?: string };

const BTN =
  "inline-flex flex-1 items-center justify-center gap-2 min-h-[44px] rounded-control border border-outline bg-surface px-3 text-sm font-semibold text-ink-1 hover:bg-tile";

const KIND_WORD: Record<string, string> = { call: "Call", email: "Email", meeting: "Meeting", event: "Event", note: "Note" };
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function LookupPage({ searchParams }: { searchParams?: Search }) {
  const ctx = await getOrgContext();
  if (!ctx) notFound();
  const [canDonors, canStudents, ents] = await Promise.all([
    ctxHasPermission(ctx, "fundraising.read"),
    ctxHasPermission(ctx, "program.read"),
    getEntitlements(ctx.orgId),
  ]);
  const captureOn = hasFeature(ents, "ai.capture") && (await ctxHasPermission(ctx, "ops.write"));
  const supabase = createServerSupabase();
  const donorId = searchParams?.donor && /^[0-9a-f-]{36}$/i.test(searchParams.donor) ? searchParams.donor : null;

  if (donorId && canDonors) {
    return <DonorCard id={donorId} orgId={ctx.orgId} captureOn={captureOn} q={searchParams?.q ?? ""} supabase={supabase} />;
  }

  const q = cleanLookupQuery(searchParams?.q);
  const like = q ? `%${q}%` : "";
  const [donorsRes, studentsRes] = await Promise.all([
    q && canDonors
      ? supabase
          .from("constituents")
          .select("id, type, first_name, last_name, org_name, emails, phones, do_not_contact")
          .eq("org_id", ctx.orgId)
          .is("archived_at", null)
          .or(`first_name.ilike.${like},last_name.ilike.${like},org_name.ilike.${like}`)
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
    q && canStudents
      ? supabase
          .from("students")
          .select("id, first_name, last_name, stage")
          .eq("org_id", ctx.orgId)
          .or(`first_name.ilike.${like},last_name.ilike.${like}`)
          .limit(6)
      : Promise.resolve({ data: [], error: null }),
  ]);
  type C = { id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null; emails: string[] | null; phones: string[] | null; do_not_contact: boolean };
  const donors = (donorsRes.data ?? []) as C[];
  const students = (studentsRes.data ?? []) as { id: string; first_name: string | null; last_name: string | null; stage: string | null }[];

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[640px]">
        <h1 className={TYPE.pageTitle}>Look someone up</h1>
        <p className={`${TYPE.metadata} mt-1`}>
          {canDonors && canStudents ? "Donors, funders and students, by name." : canDonors ? "Donors and funders, by name." : canStudents ? "Students, by name." : "Your role can't look up people."}
        </p>
        <form method="get" action="/admin/lookup" role="search" className="mt-4 flex gap-2">
          <label htmlFor="lookup-q" className="sr-only">
            Name
          </label>
          <input
            id="lookup-q"
            name="q"
            type="search"
            defaultValue={searchParams?.q ?? ""}
            placeholder="Type a name"
            autoComplete="off"
            className="min-h-[44px] min-w-0 flex-1 rounded-control border border-outline bg-surface px-3 text-base text-ink-1 placeholder-ink-3 focus:border-orange focus:outline-none"
          />
          <button type="submit" className="min-h-[44px] rounded-control bg-orange px-4 text-sm font-semibold text-white hover:bg-orange-dark">
            Search
          </button>
        </form>

        {(donorsRes.error || studentsRes.error) && (
          <div className="mt-3">
            <Notice tone="partial" title="Part of the search failed.">
              Some results may be missing. Try again in a moment.
            </Notice>
          </div>
        )}

        {q && donors.length === 0 && students.length === 0 && (
          <p className={`${TYPE.bodyMuted} mt-6`}>Nobody matches &ldquo;{q}&rdquo;. Try a first or last name.</p>
        )}
        {!q && searchParams?.q && <p className={`${TYPE.bodyMuted} mt-6`}>Type at least two letters.</p>}

        {donors.length > 0 && (
          <section aria-label="Donors and funders" className="mt-5">
            <h2 className={`${TYPE.cardLabel} mb-2`}>Donors and funders</h2>
            <ul className="divide-y divide-hairline rounded-panel border border-hairline bg-surface">
              {donors.map((c) => {
                const name = constituentName(c);
                const tel = c.do_not_contact ? null : telHref(c.phones?.[0]);
                const mail = c.do_not_contact ? null : mailHref(c.emails?.[0]);
                return (
                  <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                    <Link href={`/admin/lookup?donor=${c.id}&q=${encodeURIComponent(q ?? "")}`} className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center">
                      <span className={`${TYPE.body} font-semibold truncate`}>{name}</span>
                      <span className={`${TYPE.metadata} truncate`}>
                        {c.type === "organization" ? "Organization" : "Person"}
                        {c.do_not_contact ? " · Do not contact" : ""}
                      </span>
                    </Link>
                    {tel && (
                      <a href={tel} aria-label={`Call ${name}`} className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-outline text-ink-1">
                        <PhoneIcon />
                      </a>
                    )}
                    {mail && (
                      <a href={mail} aria-label={`Email ${name}`} className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-outline text-ink-1">
                        <MailIcon />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {students.length > 0 && (
          <section aria-label="Students" className="mt-5">
            <h2 className={`${TYPE.cardLabel} mb-2`}>Students</h2>
            <ul className="divide-y divide-hairline rounded-panel border border-hairline bg-surface">
              {students.map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/students/${s.id}`} className="flex min-h-[52px] flex-col justify-center px-3 py-2">
                    <span className={`${TYPE.body} font-semibold`}>{[s.first_name, s.last_name].filter(Boolean).join(" ") || "Student"}</span>
                    <span className={TYPE.metadata}>{s.stage ? s.stage.replace(/_/g, " ") : "Student"} · open record</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageShell>
  );
}

async function DonorCard({
  id,
  orgId,
  captureOn,
  q,
  supabase,
}: {
  id: string;
  orgId: string;
  captureOn: boolean;
  q: string;
  supabase: ReturnType<typeof createServerSupabase>;
}) {
  const today = todayInTZ();
  const [cRes, giftsRes, oppsRes, tasksRes, touchRes] = await Promise.all([
    supabase
      .from("constituents")
      .select("id, type, first_name, last_name, org_name, emails, phones, do_not_contact, created_at")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("gifts").select("amount, gift_date, acknowledgment_status").eq("org_id", orgId).eq("constituent_id", id).limit(2000),
    supabase
      .from("opportunities")
      .select("id, name, next_step, next_step_due, ask_amount, stage")
      .eq("org_id", orgId)
      .eq("constituent_id", id)
      .in("stage", ["identify", "qualify", "cultivate", "solicit"])
      .limit(20),
    supabase
      .from("ops_tasks")
      .select("id, title, due_date")
      .eq("org_id", orgId)
      .eq("linked_entity_type", "constituent")
      .eq("linked_entity_id", id)
      .neq("status", "done")
      .limit(20),
    supabase
      .from("interactions")
      .select("id, kind, occurred_at, notes, logged_by")
      .eq("org_id", orgId)
      .eq("constituent_id", id)
      .order("occurred_at", { ascending: false })
      .limit(4),
  ]);
  if (!cRes.data) notFound();
  const c = cRes.data as {
    id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null;
    emails: string[] | null; phones: string[] | null; do_not_contact: boolean; created_at: string;
  };
  const name = constituentName(c);
  const tel = c.do_not_contact ? null : telHref(c.phones?.[0]);
  const mail = c.do_not_contact ? null : mailHref(c.emails?.[0]);
  const gifts = ((giftsRes.data ?? []) as { amount: number; gift_date: string; acknowledgment_status: string | null }[]).map((g) => ({ ...g, amount: Number(g.amount) }));
  const figs = donorFigures(gifts, today);
  const opps = (oppsRes.data ?? []) as { id: string; name: string | null; next_step: string | null; next_step_due: string | null; ask_amount: number | null }[];
  const tasks = (tasksRes.data ?? []) as { id: string; title: string; due_date: string | null }[];
  const step = pickNextStep([
    ...opps.map((o) => ({
      text: o.next_step ?? "", due: o.next_step_due, source: "ask" as const,
      context: [o.name, o.ask_amount ? `${usd(Number(o.ask_amount))} ask` : null].filter(Boolean).join(", ") || null,
    })),
    ...tasks.map((t) => ({ text: t.title, due: t.due_date, source: "task" as const, context: "Task" })),
  ]);
  const touches = (touchRes.data ?? []) as { id: string; kind: string; occurred_at: string; notes: string | null; logged_by: string | null }[];
  const last = touches[0] ?? null;
  const due = step ? dueLabel(step.due, today) : null;
  const record = `/admin/fundraising/donors-funders/${c.id}`;

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[640px]">
        <Link href={q ? `/admin/lookup?q=${encodeURIComponent(q)}` : "/admin/lookup"} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-ink-2">
          Back to results
        </Link>
        <h1 className={`${TYPE.pageTitle} mt-1`}>{name}</h1>
        <p className={`${TYPE.metadata} mt-1`}>
          {c.type === "organization" ? "Organization" : "Person"} · on record since {c.created_at.slice(0, 4)}
        </p>
        {c.do_not_contact && <p className="mt-1 text-sm font-semibold text-expense">Do not contact.</p>}

        <div className="mt-4 flex gap-2">
          {tel ? (
            <a href={tel} className={BTN}>
              <PhoneIcon /> Call
            </a>
          ) : (
            <span className={`${BTN} opacity-50`} aria-disabled="true">
              <PhoneIcon /> {c.do_not_contact ? "Do not call" : "No phone"}
            </span>
          )}
          {mail ? (
            <a href={mail} className={BTN}>
              <MailIcon /> Email
            </a>
          ) : (
            <span className={`${BTN} opacity-50`} aria-disabled="true">
              <MailIcon /> {c.do_not_contact ? "Do not email" : "No email"}
            </span>
          )}
          {captureOn && <LookupTalk id={c.id} name={name} />}
        </div>

        <section aria-label="Next step" className="mt-4 rounded-panel border border-hairline bg-surface p-4">
          <h2 className={TYPE.cardLabel}>Next step</h2>
          {step ? (
            <>
              <p className={`${TYPE.body} font-semibold mt-1`}>{step.text}</p>
              {due && <p className={`text-sm mt-0.5 ${due.tone === "late" ? "text-expense font-semibold" : "text-ink-2"}`}>{due.text}</p>}
              {step.context && <p className={`${TYPE.metadata} mt-0.5`}>{step.context}</p>}
            </>
          ) : (
            <p className={`${TYPE.bodyMuted} mt-1`}>No next step yet.</p>
          )}
          <Link href={record} className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-orange">
            {step ? "Open the record to change it" : "Add one on the record"}
          </Link>
        </section>

        <section aria-label="Giving" className="mt-4 grid grid-cols-3 divide-x divide-hairline rounded-panel border border-hairline bg-surface">
          <Figure label="Lifetime" value={figs.lifetime.value == null ? null : usd(figs.lifetime.value)} source={figs.lifetime.source} />
          <Figure label="Last gift" value={figs.last.value == null ? null : usd(figs.last.value)} source={figs.last.source} />
          <Figure label="This year" value={figs.thisYear.value == null ? null : usd(figs.thisYear.value)} source={figs.thisYear.source} />
        </section>

        <section aria-label="Last time" className="mt-4 rounded-panel border border-hairline bg-surface p-4">
          <h2 className={TYPE.cardLabel}>Last time</h2>
          {last ? (
            <>
              <p className={`${TYPE.body} font-semibold mt-1`}>
                {KIND_WORD[last.kind] ?? "Touch"}, {day(last.occurred_at)}
              </p>
              {last.notes && <p className={`${TYPE.body} mt-1 line-clamp-4`}>{last.notes}</p>}
            </>
          ) : (
            <p className={`${TYPE.bodyMuted} mt-1`}>No conversations logged yet.</p>
          )}
        </section>

        {touches.length > 1 && (
          <section aria-label="Recent" className="mt-4">
            <div className="flex items-center justify-between">
              <h2 className={TYPE.cardLabel}>Recent</h2>
              <Link href={record} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-orange">
                See all
              </Link>
            </div>
            <ul className="divide-y divide-hairline rounded-panel border border-hairline bg-surface">
              {touches.slice(1).map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className={`${TYPE.body} truncate`}>{KIND_WORD[t.kind] ?? "Touch"}{t.notes ? `: ${t.notes}` : ""}</p>
                    <p className={TYPE.metadata}>{t.logged_by ? `Logged by ${t.logged_by}` : "Logged"}</p>
                  </div>
                  <span className={`${TYPE.metadata} shrink-0`}>{day(t.occurred_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link href={record} className="mt-4 flex min-h-[44px] items-center justify-center rounded-control border border-outline text-sm font-semibold text-ink-1">
          Open the full record
        </Link>
      </div>
    </PageShell>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M3 6h18v12H3zM3 7l9 7 9-7" />
    </svg>
  );
}
