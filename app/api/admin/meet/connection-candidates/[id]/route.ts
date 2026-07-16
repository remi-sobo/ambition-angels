import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { constituentName } from "@/lib/fundraising/display";
import {
  SCHEDULING_LABEL,
  SCHEDULING_TASK_CATEGORY,
} from "@/app/admin/ops/_types/ops";

// Disposition for an email-detected connection candidate (Phase 4). Shannon
// confirms — nothing here runs on sync. Two actions:
//   add     → create the scheduling task (assigned to Shannon, linked to the
//             person, with a link back to the Gmail thread) and mark the
//             candidate 'added' + store the task id.
//   dismiss → mark 'dismissed' so it never resurfaces on the next sync.

function gmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Unknown admin user" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== "add" && action !== "dismiss") {
    return NextResponse.json({ error: "action must be 'add' or 'dismiss'" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Load the candidate + the person it reconciled to. Only pending candidates
  // are actionable (added/dismissed are terminal).
  const { data: candRow, error: candErr } = await supabase
    .from("connection_candidates")
    .select(
      "id, status, thread_id, subject, constituent_id, ops_task_id, " +
        "constituent:constituent_id(type, first_name, last_name, org_name)"
    )
    .eq("id", params.id)
    .maybeSingle();
  if (candErr) {
    console.error("[connection-candidates PATCH] load:", candErr.message);
    return NextResponse.json({ error: "Failed to load candidate" }, { status: 500 });
  }
  if (!candRow) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  const cand = candRow as unknown as {
    id: string;
    status: string;
    thread_id: string;
    subject: string | null;
    constituent_id: string;
    ops_task_id: string | null;
    constituent: {
      type: string;
      first_name: string | null;
      last_name: string | null;
      org_name: string | null;
    } | null;
  };
  if (cand.status !== "pending") {
    return NextResponse.json({ error: "Candidate already disposed" }, { status: 409 });
  }

  const nowIso = new Date().toISOString();

  if (action === "dismiss") {
    const { error } = await supabase
      .from("connection_candidates")
      .update({ status: "dismissed", disposed_by: adminUser, disposed_at: nowIso })
      .eq("id", cand.id);
    if (error) {
      console.error("[connection-candidates PATCH] dismiss:", error.message);
      return NextResponse.json({ error: "Failed to dismiss" }, { status: 500 });
    }
    return NextResponse.json({ status: "dismissed" });
  }

  // action === "add": create the scheduling task, tied to the person, with a
  // link back to the thread, then mark the candidate added.
  const person = (cand.constituent ?? null) as {
    type: string;
    first_name: string | null;
    last_name: string | null;
    org_name: string | null;
  } | null;
  const name = person ? constituentName(person) : "this contact";
  const title = cand.subject?.trim() || `Connect with ${name}`;

  const { data: task, error: taskErr } = await supabase
    .from("ops_tasks")
    .insert({
      org_id: ctx.orgId,
      title,
      description: `From email intro · ${gmailThreadUrl(cand.thread_id)}`,
      category: SCHEDULING_TASK_CATEGORY,
      priority: "medium",
      labels: [SCHEDULING_LABEL],
      assigned_to: "shannon",
      created_by: adminUser,
      linked_entity_type: "constituent",
      linked_entity_id: cand.constituent_id,
      linked_label: name,
    })
    .select("id")
    .single();
  if (taskErr || !task) {
    console.error("[connection-candidates PATCH] task insert:", taskErr?.message);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }

  const { error: updErr } = await supabase
    .from("connection_candidates")
    .update({
      status: "added",
      ops_task_id: (task as { id: string }).id,
      disposed_by: adminUser,
      disposed_at: nowIso,
    })
    .eq("id", cand.id);
  if (updErr) {
    // The task exists; surface the error so the UI can refetch rather than
    // leaving a silently-orphaned candidate.
    console.error("[connection-candidates PATCH] mark added:", updErr.message);
    return NextResponse.json({ error: "Task created but candidate update failed" }, { status: 500 });
  }

  return NextResponse.json({ status: "added", ops_task_id: (task as { id: string }).id });
}
