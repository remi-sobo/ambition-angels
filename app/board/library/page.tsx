import { redirect } from "next/navigation";
import { getBoardContext } from "@/lib/board/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { Header, Footer } from "../_components/Chrome";
import LibraryList, { type LibraryDoc } from "../_components/LibraryList";
import FileUpload from "../_components/FileUpload";
import { C, F } from "../_components/tokens";

export const dynamic = "force-dynamic";

/**
 * Library (spec §5.7). Two sections, because they serve different needs:
 * Corporate records is what a director or auditor needs; Board resources is
 * what a director needs when she is opening a door.
 *
 * CURRENT DOCUMENTS ONLY. Per the Corporate Secretary, superseded versions do
 * not belong here — history lives in the corporate minute book — so the query
 * filters status to 'active' and there is deliberately no "previous versions"
 * disclosure anywhere in this file.
 */
export default async function LibraryPage() {
  const ctx = await getBoardContext();
  if (!ctx) redirect("/board/signin");

  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("documents")
    .select("id, title, filename, mime, size_bytes, doc_type, expires_at, created_at, issued_at, notes, document_links(entity_type)")
    .eq("org_id", ctx.orgId)
    .eq("status", "active")
    .eq("visibility", "org")
    .order("doc_type")
    .order("title")
    .limit(500);

  // A document filed against a meeting is meeting material, not a corporate
  // record. Both live in `documents`, so the link is the only thing that
  // tells them apart — without it the pre-read sits next to the bylaws.
  const docs = ((data ?? []) as (LibraryDoc & { document_links?: { entity_type: string }[] })[])
    .filter((d) => !(d.doc_type ?? "").startsWith("agenda:"))
    .map(({ document_links, ...d }) => ({
      ...d,
      forMeeting: (document_links ?? []).some((l) => l.entity_type === "board_meeting"),
    }));

  return (
    <>
      <Header name={ctx.memberName ?? ctx.email} roleLine={ctx.isStaff ? "Staff" : "Director"} active="library" />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px 80px" }}>
        <h1 style={{ margin: 0, fontFamily: F.heading, fontSize: 32, fontWeight: 600, letterSpacing: "-0.01em", color: C.ink }}>
          Library
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 17, lineHeight: 1.6, color: C.muted, maxWidth: "68ch" }}>
          Corporate records are the current governing set an auditor or a program officer asks for. The
          corporate minutes book holds the full history. Board resources are what you need when you are
          opening a door.
        </p>
        {/* Filing a corporate record is the same act as filing meeting
            materials, minus the link to a meeting. board.write only, which
            here is Remi and Shannon; the route re-checks. */}
        {ctx.isAdmin && (
          <div style={{ maxWidth: 560, marginTop: 32 }}>
            <FileUpload
              endpoint="/api/board/library"
              heading="File a document"
              blurb="Goes into the library for every director. Not attached to any meeting. Directors cannot see this panel."
              defaultType="policy"
            />
          </div>
        )}

        <LibraryList docs={docs} />
      </main>
      <Footer />
    </>
  );
}
