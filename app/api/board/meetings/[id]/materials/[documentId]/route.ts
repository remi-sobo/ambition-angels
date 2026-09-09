import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getBoardContext } from "@/lib/board/auth";
import { audit } from "@/lib/audit";
import { DOCUMENTS_BUCKET } from "@/lib/documents/config";

/**
 * Take a document off a meeting.
 *
 * Two modes, and the difference matters:
 *
 *  - "unlink" (the default) removes only the document_links row. A library
 *    document is precisely one with no board_meeting link, so unlinking IS
 *    the move to the library: the file, its type, its dates and its audit
 *    history are untouched, and re-filing it against the meeting restores it
 *    exactly. This is what you want almost every time.
 *
 *  - "delete" removes the documents row and the stored file as well. It is
 *    for a genuine mis-upload, it cannot be undone, and so the caller has to
 *    ask for it explicitly.
 *
 * board.write only. The unlink runs through the session client so RLS decides
 * whether this caller may touch this org's links; only the storage object,
 * which has no RLS of its own, uses the admin client.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; documentId: string } },
) {
  const ctx = await getBoardContext();
  if (!ctx?.isAdmin) {
    return NextResponse.json({ error: "Only the board admins can change materials." }, { status: 403 });
  }

  const mode = new URL(req.url).searchParams.get("mode") === "delete" ? "delete" : "unlink";
  const supabase = createServerSupabase();

  // Prove the document is this org's and actually attached to this meeting
  // before removing anything.
  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, filename, storage_path, document_links(id, entity_type, entity_id)")
    .eq("id", params.documentId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const links = (doc.document_links ?? []) as { entity_type: string; entity_id: string }[];
  if (!links.some((l) => l.entity_type === "board_meeting" && l.entity_id === params.id)) {
    return NextResponse.json({ error: "That document is not filed against this meeting." }, { status: 404 });
  }

  const { error: unlinkErr } = await supabase
    .from("document_links")
    .delete()
    .eq("document_id", params.documentId)
    .eq("entity_type", "board_meeting")
    .eq("entity_id", params.id);
  if (unlinkErr) {
    console.error("[board materials] unlink failed:", unlinkErr.message);
    return NextResponse.json({ error: "Could not move it. Try again." }, { status: 500 });
  }

  if (mode === "delete") {
    const { error: docErr } = await supabase.from("documents").delete().eq("id", params.documentId);
    if (docErr) {
      console.error("[board materials] delete failed:", docErr.message);
      // The link is already gone, so the document is in the library rather
      // than lost. Say so plainly instead of implying nothing happened.
      return NextResponse.json(
        { error: "Moved it off the meeting, but could not delete the file. It is in the library." },
        { status: 500 },
      );
    }
    // Storage has no RLS of its own, so this is the admin client's job. A
    // failure here leaves an orphaned object, not a visible document.
    const path = (doc as { storage_path?: string }).storage_path;
    if (path) {
      const { error: rmErr } = await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).remove([path]);
      if (rmErr) console.error("[board materials] storage remove failed:", rmErr.message);
    }
  }

  await audit(req, {
    action: mode === "delete" ? "board.material_deleted" : "board.material_unlinked",
    entityType: "board_meeting",
    entityId: params.id,
    actorUserId: null,
    before: { document_id: params.documentId, title: doc.title ?? doc.filename },
  });

  return NextResponse.json({ ok: true, mode });
}
