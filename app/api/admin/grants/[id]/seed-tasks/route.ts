import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { ensureGrantProject } from "@/lib/fundraising/grants";
import { getGrantStarterTasks } from "@/lib/fundraising/grantStarterTasks";

// POST /api/admin/grants/:id/seed-tasks — seed the grant's workspace project
// with the per-org starter checklist (LOI, budget, narrative, review, submit,
// report). Idempotent: only inserts template titles not already on the
// project, so a double-click or a re-run can't duplicate the list. Runs on the
// authenticated client with org_id set explicitly from the grant row, so
// ops_projects/ops_tasks RLS governs every write.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const operator = (await getAdminUser()) ?? "remi";
  const supabase = createServerSupabase();

  const { data: grant, error: gErr } = await supabase
    .from("grants")
    .select("id, org_id, name")
    .eq("id", params.id)
    .maybeSingle();
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });
  if (!grant) return NextResponse.json({ error: "Grant not found" }, { status: 404 });

  const project = await ensureGrantProject(
    supabase,
    grant as { id: string; org_id: string; name: string },
    operator
  );
  if (!project) {
    return NextResponse.json(
      { error: "Couldn't resolve the grant's project" },
      { status: 500 }
    );
  }
  const projectId = project.id as string;

  // Skip titles already on the project so re-runs don't duplicate, and append
  // after the current max display_order so the checklist lands at the bottom.
  const { data: existing } = await supabase
    .from("ops_tasks")
    .select("title, display_order")
    .eq("project_id", projectId);
  const existingTitles = new Set(
    (existing ?? []).map((t) => String(t.title).trim().toLowerCase())
  );
  const maxOrder = (existing ?? []).reduce(
    (m, t) => Math.max(m, (t.display_order as number | null) ?? 0),
    0
  );

  const template = getGrantStarterTasks(grant.org_id as string);
  const toInsert = template
    .filter((t) => !existingTitles.has(t.title.trim().toLowerCase()))
    .map((t, i) => ({
      title: t.title,
      category: "fundraising",
      priority: t.priority,
      status: "todo",
      project_id: projectId,
      org_id: grant.org_id,
      created_by: operator,
      display_order: maxOrder + i + 1,
    }));

  if (toInsert.length === 0) {
    return NextResponse.json({
      ok: true,
      seeded: 0,
      message: "Starter tasks are already on this grant.",
    });
  }

  const { error: insErr } = await supabase.from("ops_tasks").insert(toInsert);
  if (insErr) {
    console.error("[grants] seed-tasks insert failed:", insErr.message);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Keep last_touched_at fresh, matching the ops task route's touchProject.
  await supabase
    .from("ops_projects")
    .update({ last_touched_at: new Date().toISOString() })
    .eq("id", projectId);

  await audit(req, {
    action: "fundraising.grant.seed_tasks",
    entityType: "grants",
    entityId: params.id,
    after: { seeded: toInsert.length },
  });

  return NextResponse.json({ ok: true, seeded: toInsert.length });
}
