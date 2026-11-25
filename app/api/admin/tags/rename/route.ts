import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { normalizeTag, isSystemTag } from "@/lib/comms/tags";
import { renameTag, renameTagInLists } from "@/lib/admin/tags-server";

// A rename is a handful of sequential writes; give a big org room to finish.
export const maxDuration = 60;

/**
 * Rename a tag on everyone who carries it. Renaming onto a tag that already
 * exists merges the two. `to: null` deletes the tag from everyone. Pinned to
 * the active org; needs fundraising.write.
 */
export async function POST(req: NextRequest) {
  const gate = await requirePermission("fundraising.write");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  // `from` is matched exactly as stored (case-insensitive), untouched: an old
  // tag with a comma or stray space in it must still be findable to clean up.
  const from = typeof body.from === "string" ? body.from : "";
  if (!from.trim()) return NextResponse.json({ error: "Name the tag to change." }, { status: 400 });
  if (isSystemTag(from)) {
    return NextResponse.json({ error: `"${from}" is set by the HubSpot sync, which would put it straight back. It can't be renamed or deleted here.` }, { status: 409 });
  }
  const to = body.to === null ? null : normalizeTag(body.to);
  if (body.to !== null && !to) return NextResponse.json({ error: "Give the tag a name." }, { status: 400 });

  const result = await renameTag(createServerSupabase(), gate.ctx.orgId, from, to);
  if (result.error) {
    console.error("[tags] rename failed:", result.error);
    return NextResponse.json({ error: "Couldn't change the tag everywhere. Try again." }, { status: 500 });
  }
  // Saved lists that use the old name follow the rename.
  const supabase = createServerSupabase();
  const lists = to === null ? { lists: 0, error: null } : await renameTagInLists(supabase, gate.ctx.orgId, from, to);
  if (lists.error) console.error("[tags] rename in lists failed:", lists.error);
  await audit(req, {
    action: to === null ? "fundraising.tags.delete" : "fundraising.tags.rename",
    entityType: "constituents",
    after: { from, to, changed: result.changed, lists: lists.lists },
  });
  return NextResponse.json({ changed: result.changed, lists: lists.lists, lists_error: !!lists.error });
}
