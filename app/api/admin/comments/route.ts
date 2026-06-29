import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * Anchored comments for a record. Reads and writes go through the SESSION
 * client, so the entity_comments RLS policies (comments.read / comments.write,
 * org-scoped) are enforced by the database — no service-role bypass.
 *
 * v1 anchors on two entity types; the allowlist keeps a client from inventing
 * an entity_type. @mention parsing arrives in Phase 5.
 */
export const dynamic = "force-dynamic";

const ENTITY_TYPES = new Set(["constituent", "fr_prospects"]);
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const MAX_BODY = 5000;

type CommentRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  author_id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
};

// GET /api/admin/comments?entity_type=&entity_id=
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entity_type");
  const entityId = url.searchParams.get("entity_id");
  if (!entityType || !ENTITY_TYPES.has(entityType)) {
    return NextResponse.json({ error: "invalid entity_type" }, { status: 400 });
  }
  if (!isUuid(entityId)) {
    return NextResponse.json({ error: "invalid entity_id" }, { status: 400 });
  }

  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("entity_comments")
    .select("id, entity_type, entity_id, author_id, body, parent_id, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[/api/admin/comments GET] error:", error.message);
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }

  const rows = (data ?? []) as CommentRow[];

  // Resolve author display names. profiles is readable for co-org members
  // (shares_org RLS); a member without a profile row falls back to "Teammate".
  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  const names = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profs } = await sb
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", authorIds);
    for (const p of (profs ?? []) as Array<{ user_id: string; display_name: string | null }>) {
      if (p.display_name) names.set(p.user_id, p.display_name);
    }
  }

  const comments = rows.map((r) => ({
    id: r.id,
    body: r.body,
    authorId: r.author_id,
    authorName: names.get(r.author_id) ?? "Teammate",
    parentId: r.parent_id,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ comments, me: ctx.userId });
}

// POST /api/admin/comments  { entity_type, entity_id, body, parent_id? }
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const entityType = body.entity_type;
  if (typeof entityType !== "string" || !ENTITY_TYPES.has(entityType)) {
    return NextResponse.json({ error: "invalid entity_type" }, { status: 400 });
  }
  if (!isUuid(body.entity_id)) {
    return NextResponse.json({ error: "invalid entity_id" }, { status: 400 });
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body is required" }, { status: 400 });
  if (text.length > MAX_BODY) {
    return NextResponse.json({ error: "body too long" }, { status: 400 });
  }
  if (body.parent_id !== undefined && body.parent_id !== null && !isUuid(body.parent_id)) {
    return NextResponse.json({ error: "invalid parent_id" }, { status: 400 });
  }

  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("entity_comments")
    .insert({
      org_id: ctx.orgId, // from session — never a column default
      entity_type: entityType,
      entity_id: body.entity_id as string,
      author_id: ctx.userId,
      body: text,
      parent_id: (body.parent_id as string | null | undefined) ?? null,
    })
    .select("id, author_id, body, parent_id, created_at")
    .single();

  if (error) {
    console.error("[/api/admin/comments POST] error:", error.message);
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }

  return NextResponse.json({ comment: data });
}
