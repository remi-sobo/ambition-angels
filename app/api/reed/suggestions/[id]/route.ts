import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";
import { parseExtractionPayload, type ExtractionPayload } from "@/lib/agents/reed/extraction";

export const dynamic = "force-dynamic";

// Accept or dismiss one cross-module Reed suggestion (Phase 7 decision layer +
// spec #6 Phase 4 appliers). Accepting requires the domain's write permission;
// any member may dismiss. A suggestion with a TYPED extraction payload
// (document_fields | obligation_task) is APPLIED on accept — through the same
// session-client write paths the UI uses, so RLS is the enforcement either
// way — and only marked accepted after the apply succeeds. Suggestions with
// no payload (or an unknown/invalid one) keep the original behavior: accept
// records the decision and executes nothing.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== "accept" && action !== "dismiss") {
    return NextResponse.json({ error: "action must be 'accept' or 'dismiss'" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: sug } = await supabase
    .from("reed_suggestions")
    .select("id, domain, status, payload")
    .eq("id", params.id)
    .maybeSingle();
  if (!sug) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((sug as { status: string }).status !== "suggested") {
    return NextResponse.json({ error: "Already decided" }, { status: 409 });
  }

  let applied: Record<string, unknown> | null = null;
  if (action === "accept") {
    const perm = `${(sug as { domain: string }).domain}.write`;
    if (!(await hasPermission(supabase, ctx.orgId, perm))) {
      return NextResponse.json({ error: `Requires ${perm}` }, { status: 403 });
    }

    // Apply a typed extraction payload BEFORE marking accepted, so a failed
    // apply leaves the suggestion open (retryable) instead of half-done.
    const rawPayload = (sug as { payload: unknown }).payload;
    if (rawPayload != null) {
      const parsed = parseExtractionPayload(rawPayload);
      if (parsed.ok) {
        const result = await applyExtraction(supabase, ctx.orgId, parsed.payload);
        if ("error" in result) return NextResponse.json({ error: result.error }, { status: 500 });
        applied = result;
      }
      // Invalid/unknown payloads fall through: the decision is recorded,
      // nothing is applied (the inbox renders these without an apply framing).
    }
  }

  const status = action === "accept" ? "accepted" : "dismissed";
  const { error } = await supabase
    .from("reed_suggestions")
    .update({ status, decided_by: ctx.email, decided_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status, applied });
}

// The two v1 appliers (spec #6 decision B). Session client throughout:
// documents.write / ops.write RLS is the hard boundary under the app check.
async function applyExtraction(
  supabase: SupabaseClient,
  orgId: string,
  payload: ExtractionPayload,
): Promise<Record<string, unknown> | { error: string }> {
  if (payload.kind === "document_fields") {
    const patch: Record<string, unknown> = {};
    if (payload.expires_at) patch.expires_at = payload.expires_at;
    if (payload.doc_type) patch.doc_type = payload.doc_type;
    const { data, error } = await supabase
      .from("documents")
      .update(patch)
      .eq("id", payload.document_id)
      .eq("org_id", orgId)
      .select("id")
      .maybeSingle();
    if (error) return { error: `Could not update the document: ${error.message}` };
    if (!data) return { error: "The document was not found (or you can't modify it)." };
    return { kind: "document_fields", document_id: payload.document_id, ...patch };
  }

  // obligation_task — mirrors the canonical ops task create route's insert
  // shape, linked to the source document so the reviewer can trace it.
  const { data: doc } = await supabase
    .from("documents")
    .select("title, filename")
    .eq("id", payload.document_id)
    .eq("org_id", orgId)
    .maybeSingle();
  const createdBy = (await getAdminUser()) ?? "admin";
  const { data: task, error } = await supabase
    .from("ops_tasks")
    .insert({
      org_id: orgId,
      title: payload.title,
      description: payload.description ?? null,
      category: payload.category ?? "other",
      priority: "medium",
      created_by: createdBy,
      due_date: payload.due_date ?? null,
      linked_entity_type: "document",
      linked_entity_id: payload.document_id,
      linked_label: doc ? ((doc.title as string | null) ?? (doc.filename as string)).slice(0, 200) : null,
    })
    .select("id")
    .single();
  if (error) return { error: `Could not create the task: ${error.message}` };
  return { kind: "obligation_task", task_id: (task as { id: string }).id };
}
