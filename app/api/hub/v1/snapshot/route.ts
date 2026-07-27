import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Read-only snapshot adapter for the life hub (Trellis).
 *
 * GET /api/hub/v1/snapshot?since=<iso8601>
 *
 * Serves Remi's and Kendra's BloomOS work — nothing else — to the personal
 * planning hub hosted in Trellis. Bearer-token auth (HUB_SNAPSHOT_SECRET),
 * the TASK_INGEST_SECRET pattern: 503 when unset, 401 on mismatch.
 *
 * Contract (life-hub-spec §3.3):
 *   { system, generated_at, projects[], tasks[], full_open_ids }
 *
 * - `since` filters projects/tasks to rows with updated_at > since
 *   (updated_at is DB-trigger-maintained on both tables, so delta is safe).
 * - `full_open_ids` is ALWAYS the complete current id set of open, in-scope
 *   rows regardless of `since` — sources hard-delete, so the hub diffs this
 *   list every run to detect removals. Omitting an id here reads as a
 *   deletion hub-side, which is why any query failure must 500 rather than
 *   return a partial response.
 * - Statuses pass through raw; the two category taxonomies (task ≠ project)
 *   pass through as labels unmerged. Mapping is the hub's job.
 */

export const dynamic = "force-dynamic";

// The only two people whose work leaves this endpoint. Confirmed profile
// user_ids (2026-07-27); Shannon's rows must never appear in a response.
const REMI_ID = "aa39cd02-b813-4e75-aa36-52adadf5d2fe";
const KENDRA_ID = "e139525e-9056-4875-84ca-aac1a30f5a7e";
const HUB_USER_IDS = [REMI_ID, KENDRA_ID];

// Org slug → area_hint. Only these orgs sync; the Young Life org's slug is
// young-life-epa but the hub contract's area vocabulary says young-life.
const ORG_AREA_HINTS: Record<string, "ambition-angels" | "young-life"> = {
  "ambition-angels": "ambition-angels",
  "young-life-epa": "young-life",
};

const PAGE = 1000;

type ProjectRow = {
  id: string;
  title: string;
  status: string;
  category: string;
  assigned_to: string | null;
  org_id: string;
  updated_at: string;
};

type TaskRow = {
  id: string;
  project_id: string | null;
  title: string;
  status: string;
  due_date: string | null;
  assigned_to_id: string | null;
  category: string;
  labels: string[] | null;
  updated_at: string;
};

export async function GET(req: NextRequest) {
  const secret = process.env.HUB_SNAPSHOT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Hub snapshot is not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sinceParam = req.nextUrl.searchParams.get("since");
  let sinceMs: number | null = null;
  if (sinceParam !== null) {
    sinceMs = Date.parse(sinceParam);
    if (Number.isNaN(sinceMs)) {
      return NextResponse.json({ error: "Invalid since (expected ISO 8601)" }, { status: 400 });
    }
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: orgs, error: orgsError } = await supabase
      .from("orgs")
      .select("id, slug")
      .in("slug", Object.keys(ORG_AREA_HINTS));
    if (orgsError) throw new Error(`orgs: ${orgsError.message}`);
    const missing = Object.keys(ORG_AREA_HINTS).filter(
      (slug) => !(orgs ?? []).some((o) => o.slug === slug)
    );
    if (missing.length > 0) {
      // A missing org would silently drop its ids from full_open_ids, which
      // the hub reads as mass deletion. Fail loudly instead.
      throw new Error(`org(s) not found: ${missing.join(", ")}`);
    }
    const areaHintByOrgId = new Map((orgs ?? []).map((o) => [o.id, ORG_AREA_HINTS[o.slug]]));
    const orgIds = Array.from(areaHintByOrgId.keys());

    // ops_projects has no assigned_to_id column — ownership is the free-text
    // assigned_to. Resolve it exactly the way the DB's own sync_assigned_to_id
    // trigger does: first token of profiles.display_name, case-insensitive,
    // restricted to the two approved profiles.
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", HUB_USER_IDS);
    if (profilesError) throw new Error(`profiles: ${profilesError.message}`);
    const userIdByFirstName = new Map(
      (profiles ?? []).map((p) => [
        (p.display_name ?? "").trim().split(/\s+/)[0].toLowerCase(),
        p.user_id,
      ])
    );
    const projectOwner = (assignedTo: string | null): string | null =>
      assignedTo ? userIdByFirstName.get(assignedTo.trim().split(/\s+/)[0].toLowerCase()) ?? null : null;

    const projectRows = await fetchAllPages<ProjectRow>((from, to) =>
      supabase
        .from("ops_projects")
        .select("id, title, status, category, assigned_to, org_id, updated_at")
        .in("org_id", orgIds)
        .neq("status", "archived")
        .order("id")
        .range(from, to)
    );

    // In-scope projects: assigned to Remi/Kendra, or unassigned. A project
    // assigned to anyone else (e.g. Shannon) stays out entirely.
    const projects = projectRows
      .map((p) => ({ ...p, owner: projectOwner(p.assigned_to) }))
      .filter((p) => p.owner !== null || p.assigned_to === null);
    const ownedProjectIds = projects.filter((p) => p.owner !== null).map((p) => p.id);

    // In-scope tasks: assigned to Remi/Kendra, plus unassigned tasks on
    // projects assigned to them. Archived rows never sync.
    const assigneeFilter =
      ownedProjectIds.length > 0
        ? `assigned_to_id.in.(${HUB_USER_IDS.join(",")}),and(assigned_to_id.is.null,project_id.in.(${ownedProjectIds.join(",")}))`
        : `assigned_to_id.in.(${HUB_USER_IDS.join(",")})`;
    const tasks = await fetchAllPages<TaskRow>((from, to) =>
      supabase
        .from("ops_tasks")
        .select("id, project_id, title, status, due_date, assigned_to_id, category, labels, updated_at")
        .in("org_id", orgIds)
        .is("archived_at", null)
        .or(assigneeFilter)
        .order("id")
        .range(from, to)
    );

    const afterSince = (updatedAt: string) =>
      sinceMs === null || Date.parse(updatedAt) > sinceMs;

    return NextResponse.json(
      {
        system: "bloomos",
        generated_at: new Date().toISOString(),
        projects: projects.filter((p) => afterSince(p.updated_at)).map((p) => ({
          external_id: p.id,
          name: p.title,
          status: p.status,
          area_hint: areaHintByOrgId.get(p.org_id),
          owner: p.owner,
          labels: [p.category],
          updated_at: p.updated_at,
        })),
        tasks: tasks.filter((t) => afterSince(t.updated_at)).map((t) => ({
          external_id: t.id,
          project_external_id: t.project_id,
          title: t.title,
          status: t.status,
          due_date: t.due_date,
          owner: t.assigned_to_id,
          labels: [t.category, ...(t.labels ?? [])],
          updated_at: t.updated_at,
        })),
        full_open_ids: {
          projects: projects.filter((p) => p.status !== "done").map((p) => p.id),
          tasks: tasks.filter((t) => t.status !== "done").map((t) => t.id),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Snapshot failed: ${message}` }, { status: 500 });
  }
}

/** Drain a paginated query; PostgREST caps a single response at 1000 rows. */
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}
