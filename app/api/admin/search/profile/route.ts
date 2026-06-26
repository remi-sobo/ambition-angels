/**
 * GET /api/admin/search/profile?id=<constituent uuid> — BloomOS 360° profile
 * (Phase 2, "aggregator"). Resolves one constituent and fans out across every
 * table that references it — gifts, grants, recurring plans, tasks,
 * relationships, household, interactions, meetings — into a single payload the
 * search overlay renders inline. This is the "type Koshland, see everything"
 * card.
 *
 * Implemented as a route-layer fan-out (parallel queries) rather than the
 * Postgres RPC sketched in the spec, so it ships without a migration; the shape
 * it returns is the same. Same isAuthed + RLS user-session posture as the rest
 * of admin search.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { constituentName } from "@/lib/fundraising/display";
import type {
  ProfilePayload,
  ProfileRow,
  ProfileSection,
  ProfileStat,
  ProfileTimelineItem,
} from "@/app/admin/_components/search/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

// Grants still in play (everything except the two terminal stages).
const CLOSED_GRANT_STAGES = new Set(["declined", "closed"]);

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // Base record first — its emails/household drive the dependent queries.
  const { data: base } = await supabase
    .from("constituents")
    .select("id, type, first_name, last_name, org_name, emails, city, state, tags, household_id, do_not_contact")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (!base) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const emails: string[] = base.emails ?? [];

  // Wave 1: everything keyed directly off the constituent id.
  const [giftsRes, grantsRes, recurringRes, tasksRes, interactionsRes, relsRes] = await Promise.all([
    supabase
      .from("gifts")
      .select("id, amount, gift_date, method")
      .eq("constituent_id", id)
      .order("gift_date", { ascending: false }),
    supabase
      .from("grants")
      .select("id, name, stage, amount_requested, amount_awarded")
      .eq("funder_id", id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("recurring_plans")
      .select("id, amount, frequency, status")
      .eq("constituent_id", id)
      .eq("status", "active"),
    supabase
      .from("ops_tasks")
      .select("id, title, status, priority, due_date")
      .eq("linked_entity_type", "constituent")
      .eq("linked_entity_id", id)
      .is("archived_at", null)
      .order("due_date", { ascending: true }),
    supabase
      .from("interactions")
      .select("id, kind, occurred_at, notes")
      .eq("constituent_id", id)
      .order("occurred_at", { ascending: false })
      .limit(8),
    supabase
      .from("relationships")
      .select("a_id, b_id, kind")
      .or(`a_id.eq.${id},b_id.eq.${id}`),
  ]);

  const gifts = (giftsRes.data ?? []) as Array<{ id: string; amount: number; gift_date: string; method: string }>;
  const grants = (grantsRes.data ?? []) as Array<{ id: string; name: string; stage: string; amount_requested: number | null; amount_awarded: number | null }>;
  const recurring = (recurringRes.data ?? []) as Array<{ id: string; amount: number; frequency: string; status: string }>;
  const tasks = (tasksRes.data ?? []) as Array<{ id: string; title: string; status: string; priority: string | null; due_date: string | null }>;
  const interactions = (interactionsRes.data ?? []) as Array<{ id: string; kind: string; occurred_at: string; notes: string | null }>;
  const rels = (relsRes.data ?? []) as Array<{ a_id: string; b_id: string; kind: string }>;

  // Wave 2: things that need data from wave 1 (related-party names, household
  // members, meetings matched by email).
  const relatedIds = rels.map((r) => (r.a_id === id ? r.b_id : r.a_id));
  const [relatedRes, householdRes, bookingsRes] = await Promise.all([
    relatedIds.length
      ? supabase.from("constituents").select("id, type, first_name, last_name, org_name").in("id", relatedIds)
      : Promise.resolve({ data: [] as never[] }),
    base.household_id
      ? supabase
          .from("constituents")
          .select("id, type, first_name, last_name, org_name")
          .eq("household_id", base.household_id)
          .neq("id", id)
      : Promise.resolve({ data: [] as never[] }),
    emails.length
      ? supabase
          .from("bookings")
          .select("id, attendee_name, start_time, status")
          .in("attendee_email", emails)
          .order("start_time", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  type NamedRow = { id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null };
  const relatedById = new Map<string, NamedRow>(
    ((relatedRes.data ?? []) as NamedRow[]).map((r) => [r.id, r])
  );
  const household = (householdRes.data ?? []) as NamedRow[];
  const bookings = (bookingsRes.data ?? []) as Array<{ id: string; attendee_name: string | null; start_time: string | null; status: string }>;

  // ── Stats ────────────────────────────────────────────────────────────────
  const lifetime = gifts.reduce((sum, g) => sum + Number(g.amount || 0), 0);
  const openGrants = grants.filter((g) => !CLOSED_GRANT_STAGES.has(g.stage)).length;
  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const lastTouch = interactions[0]?.occurred_at ?? null;

  const stats: ProfileStat[] = [
    { label: "Lifetime giving", value: money(lifetime) },
    { label: "Gifts", value: String(gifts.length) },
    { label: "Open grants", value: String(openGrants) },
    { label: "Open tasks", value: String(openTasks) },
  ];
  if (recurring[0]) {
    const r = recurring[0];
    const per = r.frequency === "monthly" ? "/mo" : ` / ${r.frequency}`;
    stats.push({ label: "Recurring", value: `${money(Number(r.amount))}${per}` });
  }
  if (lastTouch) stats.push({ label: "Last touch", value: shortDate(lastTouch) ?? "—" });
  if (base.do_not_contact) stats.push({ label: "Do not contact", value: "Yes", tone: "warn" });

  // ── Sections ───────────────────────────────────────────────────────────────
  const sections: ProfileSection[] = [];
  const pushSection = (key: string, label: string, rows: ProfileRow[]) => {
    if (rows.length) sections.push({ key, label, rows });
  };

  pushSection(
    "grants",
    "Grants & Deals",
    grants.slice(0, 5).map((g) => {
      const amt = g.amount_awarded ?? g.amount_requested;
      return {
        id: g.id,
        title: g.name,
        subtitle: amt != null ? money(Number(amt)) : undefined,
        badge: titleCase(g.stage),
        href: "/admin/fundraising/grants",
      };
    })
  );

  pushSection(
    "gifts",
    "Gifts",
    gifts.slice(0, 5).map((g) => ({
      id: g.id,
      title: money(Number(g.amount)),
      subtitle: [titleCase(g.method), shortDate(g.gift_date)].filter(Boolean).join(" · "),
      href: `/admin/fundraising/donors/${id}`,
    }))
  );

  pushSection(
    "tasks",
    "Tasks",
    tasks.slice(0, 5).map((t) => ({
      id: t.id,
      title: t.title,
      subtitle: [titleCase(t.status), t.due_date ? `due ${shortDate(t.due_date)}` : null]
        .filter(Boolean)
        .join(" · "),
      badge: t.priority === "urgent" || t.priority === "high" ? titleCase(t.priority) : undefined,
      href: "/admin/ops",
    }))
  );

  const peopleRows: ProfileRow[] = [];
  for (const r of rels) {
    const otherId = r.a_id === id ? r.b_id : r.a_id;
    const other = relatedById.get(otherId);
    if (!other) continue;
    peopleRows.push({
      id: otherId,
      title: constituentName(other),
      subtitle: titleCase(r.kind),
      href: `/admin/fundraising/donors/${otherId}`,
    });
  }
  for (const m of household) {
    if (peopleRows.some((p) => p.id === m.id)) continue;
    peopleRows.push({
      id: m.id,
      title: constituentName(m),
      subtitle: "Household",
      href: `/admin/fundraising/donors/${m.id}`,
    });
  }
  pushSection("people", "People", peopleRows.slice(0, 6));

  pushSection(
    "meetings",
    "Meetings",
    bookings.map((b) => ({
      id: b.id,
      title: b.attendee_name || "Meeting",
      subtitle: [shortDate(b.start_time), titleCase(b.status)].filter(Boolean).join(" · "),
      href: "/admin/meetings",
    }))
  );

  // ── Activity timeline ───────────────────────────────────────────────────────
  const timeline: ProfileTimelineItem[] = interactions.map((i) => ({
    kind: i.kind,
    when: shortDate(i.occurred_at),
    text: i.notes?.trim() || titleCase(i.kind),
  }));

  const name = constituentName(base);
  const subtitle = [
    base.type === "organization" ? "Organization" : "Person",
    [base.city, base.state].filter(Boolean).join(", ") || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const payload: ProfilePayload = {
    entity: {
      id,
      name,
      subtitle,
      href: `/admin/fundraising/donors/${id}`,
      tags: base.tags ?? [],
      doNotContact: !!base.do_not_contact,
    },
    stats,
    sections,
    timeline,
  };

  return NextResponse.json(payload);
}
