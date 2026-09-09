/**
 * Upload board meeting materials and link them to a meeting, in one step.
 *
 * Why this exists rather than "just use /admin/documents": the upload modal
 * sends only a doc_type. It has no way to attach a file to a board meeting,
 * and `board_meeting` is not in the API's link map either — so a document
 * uploaded through the UI lands in the library and never appears on the
 * meeting page. The board portal reads materials through
 * document_links(entity_type='board_meeting'), so the link is the part that
 * matters and the UI cannot make it.
 *
 * Two rules this script enforces that are easy to get wrong by hand:
 *   - visibility stays 'org'. The board carve-out in documents_schema.sql
 *     deliberately excludes restricted documents, so a restricted upload is
 *     invisible to every director with no error anywhere.
 *   - doc_type must be one of DOC_TYPES. There is no per-agenda-item value;
 *     documents attach to the MEETING.
 *
 * Usage, from the repo root, with the service-role key in the environment
 * (it is already in .env.local if you run the app locally):
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/upload-board-materials.ts ./materials
 *
 *   node scripts/upload-board-materials.ts ./materials --date 2026-09-09
 *   node scripts/upload-board-materials.ts ./materials --dry-run
 *
 * Every PDF in the directory is uploaded. Title and doc_type come from
 * MANIFEST below when the filename matches, and fall back to the filename
 * with doc_type 'board_packet'. Re-running is safe: a document already
 * linked to the meeting under the same title is skipped, not duplicated.
 */

import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const BUCKET = "bloomos-documents";
const ORG_SLUG = "ambition-angels";

/** filename fragment (lowercased) → how it should appear to a director. */
const MANIFEST: { match: string; title: string; docType: string }[] = [
  { match: "preread", title: "Board pre-read, FY26 Q2", docType: "board_packet" },
  { match: "pre-read", title: "Board pre-read, FY26 Q2", docType: "board_packet" },
  { match: "price_sheet", title: "Schools and Organizations price sheet", docType: "board_packet" },
  { match: "price-sheet", title: "Schools and Organizations price sheet", docType: "board_packet" },
  { match: "runway", title: "Weekly runway report, September 8, 2026", docType: "financial" },
  { match: "conflict_of_interest", title: "2026 conflict of interest disclosure", docType: "policy" },
  { match: "conflict-of-interest", title: "2026 conflict of interest disclosure", docType: "policy" },
  { match: "minutes", title: "Minutes, March 12, 2026", docType: "minutes" },
  { match: "elections", title: "2026 Board Elections Resolution, signed", docType: "policy" },
  { match: "balance", title: "Statement of Financial Position, August 31, 2026", docType: "financial" },
  { match: "profit", title: "Statement of Activity, January to August 2026", docType: "financial" },
];

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/** Mirrors lib/documents/config.ts so paths match what the app would write. */
function safeFilename(name: string): string {
  const trimmed = name.trim().slice(0, 140) || "document";
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function describe(file: string): { title: string; docType: string } {
  const lower = basename(file).toLowerCase();
  const hit = MANIFEST.find((m) => lower.includes(m.match));
  if (hit) return { title: hit.title, docType: hit.docType };
  return { title: basename(file, extname(file)).replace(/[_-]+/g, " ").trim(), docType: "board_packet" };
}

async function main() {
  const args = process.argv.slice(2);
  const dir = resolve(args.find((a) => !a.startsWith("--")) ?? "./materials");
  const dryRun = args.includes("--dry-run");
  const dateArg = args[args.indexOf("--date") + 1];
  const meetingDate = args.includes("--date") && dateArg ? dateArg : "2026-09-09";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Both are in .env.local if you run the app locally:\n" +
        "  export $(grep -E 'NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY' .env.local | xargs)",
    );
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: org } = await db.from("orgs").select("id").eq("slug", ORG_SLUG).maybeSingle();
  if (!org) throw new Error(`org "${ORG_SLUG}" not found`);
  const orgId = org.id as string;

  const { data: meeting } = await db
    .from("board_meetings")
    .select("id, title, meeting_date")
    .eq("org_id", orgId)
    .eq("meeting_date", meetingDate)
    .maybeSingle();
  if (!meeting) throw new Error(`no board meeting on ${meetingDate}`);
  console.log(`Meeting: ${meeting.title} (${meeting.meeting_date})\n`);

  // What is already attached, so a re-run adds only what is missing.
  const { data: existing } = await db
    .from("document_links")
    .select("documents(title)")
    .eq("entity_type", "board_meeting")
    .eq("entity_id", meeting.id);
  // The embed comes back as an object or a one-element array depending on how
  // supabase-js infers the relationship, so normalize both shapes.
  type LinkRow = { documents: { title: string | null } | { title: string | null }[] | null };
  const attached = new Set(
    ((existing ?? []) as unknown as LinkRow[])
      .map((r) => (Array.isArray(r.documents) ? r.documents[0]?.title : r.documents?.title))
      .filter((t): t is string => !!t),
  );

  const files = readdirSync(dir)
    .filter((f) => statSync(join(dir, f)).isFile() && MIME_BY_EXT[extname(f).toLowerCase()])
    .sort();
  if (files.length === 0) throw new Error(`no uploadable files in ${dir}`);

  for (const file of files) {
    const full = join(dir, file);
    const { title, docType } = describe(file);

    if (attached.has(title)) {
      console.log(`· skip   ${title} — already on this meeting`);
      continue;
    }
    if (dryRun) {
      console.log(`· would  ${title}  [${docType}]  ← ${file}`);
      continue;
    }

    const buf = readFileSync(full);
    const mime = MIME_BY_EXT[extname(file).toLowerCase()];
    const documentId = randomUUID();
    const path = `${orgId}/${documentId}/${safeFilename(file)}`;

    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: mime, upsert: false });
    if (upErr) throw new Error(`upload failed for ${file}: ${upErr.message}`);

    const { error: docErr } = await db.from("documents").insert({
      id: documentId,
      org_id: orgId,
      storage_path: path,
      filename: file.slice(0, 255),
      mime,
      size_bytes: buf.length,
      title,
      doc_type: docType,
      // Never 'restricted': the board read carve-out excludes those, and a
      // director would see nothing with no error to explain it.
      visibility: "org",
      status: "active",
    });
    if (docErr) throw new Error(`documents insert failed for ${file}: ${docErr.message}`);

    const { error: linkErr } = await db.from("document_links").insert({
      org_id: orgId,
      document_id: documentId,
      entity_type: "board_meeting",
      entity_id: meeting.id,
    });
    if (linkErr) throw new Error(`link failed for ${file}: ${linkErr.message}`);

    console.log(`✓ added  ${title}  [${docType}]  ${(buf.length / 1024).toFixed(0)} KB`);
  }

  const { count } = await db
    .from("document_links")
    .select("*", { count: "exact", head: true })
    .eq("entity_type", "board_meeting")
    .eq("entity_id", meeting.id);
  console.log(`\n${count ?? 0} document(s) now attached. They appear under Materials at /board.`);
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
