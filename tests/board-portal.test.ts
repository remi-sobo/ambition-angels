import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards for the board portal's two non-negotiable properties.
 *
 * 1. member_notes is readable only by the director who wrote it. RLS enforces
 *    it in the database, but the service-role client BYPASSES RLS — so a
 *    single getSupabaseAdmin() read of member_notes anywhere in application
 *    code silently defeats the whole guarantee. That is exactly the kind of
 *    change that looks harmless in review, so it is asserted here.
 *
 * 2. The roster check on sign-in must not leak who is on the board. An address
 *    that is not on the roster gets the identical response and no email.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const sourceFiles = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib"))];

/** Strip comments so a file that merely EXPLAINS why it avoids the admin
 *  client (as these routes do, at length) is not flagged as using it. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("member_notes privacy", () => {
  test("no file reads or writes member_notes with the service-role client", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const src = code(readFileSync(file, "utf8"));
      if (!src.includes("member_notes")) continue;
      // A file touching member_notes must not also reach for the admin client.
      if (src.includes("getSupabaseAdmin")) {
        offenders.push(file.replace(`${ROOT}/`, ""));
      }
    }
    expect(
      offenders,
      "member_notes must only be reached through the user-scoped client so RLS applies",
    ).toEqual([]);
  });

  test("the notes route scopes every write to the signed-in director", () => {
    const src = code(readFileSync(join(ROOT, "app/api/board/meetings/[id]/notes/route.ts"), "utf8"));
    expect(src).toContain("createServerSupabase");
    expect(src).not.toContain("getSupabaseAdmin");
    // The row is always keyed to the caller's own board_member_id, never to
    // an id supplied by the request body.
    expect(src).toContain("board_member_id: ctx.memberId");
    expect(src).not.toMatch(/board_member_id:\s*(payload|body)\./);
  });

  test("the migration grants member_notes no board.write policy", () => {
    const sql = readFileSync(join(ROOT, "supabase/migrations/create_board_portal.sql"), "utf8");
    const start = sql.indexOf("alter table public.member_notes enable row level security");
    expect(start).toBeGreaterThan(-1);
    const section = sql.slice(start, sql.indexOf("member_questions: the asker"));
    // The only policy on member_notes is the owner policy. board.write would
    // hand board_admin a read path.
    expect(section).not.toContain("board.write");
    expect(section).toContain("private.board_member_id(org_id)");
  });
});

describe("sharing a note does not weaken member_notes", () => {
  const share = code(
    readFileSync(join(ROOT, "app/api/board/meetings/[id]/notes/share/route.ts"), "utf8"),
  );

  test("the share route reads notes as the caller, never as service-role", () => {
    expect(share).toContain("createServerSupabase");
    expect(share).not.toContain("getSupabaseAdmin");
    // The read is pinned to the caller's own row, so RLS and the query agree.
    expect(share).toContain("board_member_id\", ctx.memberId");
  });

  test("the shared copy takes its text from the note, not from the request", () => {
    // The request names agenda items only. If body text could arrive in the
    // payload, a client could put words in a director's mouth.
    expect(share).toContain("agendaItemIds");
    expect(share).not.toMatch(/body:\s*(payload|parsed)\./);
    expect(share).toContain("n.body.trim()");
  });

  test("sending copies into shared_notes and never touches member_notes", () => {
    expect(share).toContain('from("shared_notes").insert');
    // No update, no delete, no select of anyone else's notes.
    expect(share).not.toMatch(/from\("member_notes"\)\s*\.\s*(update|delete|upsert)/);
  });

  test("shared_notes lets the author insert only as herself", () => {
    const sql = readFileSync(join(ROOT, "supabase/migrations/create_shared_notes.sql"), "utf8");
    const insert = sql.slice(sql.indexOf('create policy "author sends note"'));
    const insertPolicy = insert.slice(0, insert.indexOf(";"));
    expect(insertPolicy).toContain("for insert");
    expect(insertPolicy).toContain("private.board_member_id(org_id)");
    // board.write may read what was sent; it may never write a row as
    // somebody else, which would forge a director's words.
    expect(insertPolicy).not.toContain("board.write");
  });

  test("shared_notes has no update or delete policy for anyone", () => {
    const sql = readFileSync(join(ROOT, "supabase/migrations/create_shared_notes.sql"), "utf8");
    expect(sql).not.toMatch(/for\s+update/);
    expect(sql).not.toMatch(/for\s+delete/);
    expect(sql).not.toMatch(/for\s+all/);
  });

  test("board.write does not grant a read path to sent notes", () => {
    const sql = readFileSync(join(ROOT, "supabase/migrations/create_shared_notes.sql"), "utf8");
    // The recipient is one named person, set as data on a board_members row.
    // board.write is Remi AND Shannon, so using it here would hand a note the
    // director addressed to one person to two.
    const from = sql.indexOf('create policy "author or recipient reads note"');
    expect(from).toBeGreaterThan(-1);
    const policy = sql.slice(from, sql.indexOf(";", from));
    // The read policy names the recipient helper and nothing about roles.
    expect(policy).toContain("private.is_shared_notes_recipient(org_id)");
    expect(policy).not.toContain("has_permission");
    expect(policy).not.toContain("board.write");
    // And the helper is driven by a flag on the roster row.
    const helper = sql.slice(
      sql.indexOf("create or replace function private.is_shared_notes_recipient"),
    );
    expect(helper.slice(0, helper.indexOf("$$;"))).toContain("b.receives_shared_notes");
  });

  test("the inbox renders for the recipient, not for board admins", () => {
    const page = code(readFileSync(join(ROOT, "app/board/meetings/[id]/page.tsx"), "utf8"));
    expect(page).toContain("ctx.isNotesRecipient && (");
    // The read itself is gated the same way, so an admin never even asks.
    expect(page).toContain("ctx.isNotesRecipient ? await getSharedNotes");
    expect(page).not.toContain("ctx.isAdmin ? await getSharedNotes");
  });

  test("the recipient flag is read from the roster, never assumed", () => {
    const auth = code(readFileSync(join(ROOT, "lib/board/auth.ts"), "utf8"));
    expect(auth).toContain("receives_shared_notes");
    // isNotesRecipient must come from the member row, not from the permission.
    expect(auth).toContain("isNotesRecipient: !!member?.receives_shared_notes");
    expect(auth).not.toContain("isNotesRecipient: !!perm");
  });
});

describe("taking a document off a meeting", () => {
  const src = code(
    readFileSync(join(ROOT, "app/api/board/meetings/[id]/materials/[documentId]/route.ts"), "utf8"),
  );

  test("only a board admin may remove materials", () => {
    expect(src).toContain("ctx?.isAdmin");
    expect(src).toContain("403");
  });

  test("unlink is the default and delete must be asked for", () => {
    // Getting the mode backwards would destroy a file on a misfiled upload.
    expect(src).toContain('=== "delete" ? "delete" : "unlink"');
  });

  test("the link removal is scoped to this meeting and this org", () => {
    expect(src).toContain('.eq("entity_type", "board_meeting")');
    expect(src).toContain('.eq("entity_id", params.id)');
    expect(src).toContain('.eq("org_id", ctx.orgId)');
  });

  test("rows go through the session client so RLS applies", () => {
    // The admin client appears once and only for storage, which has no RLS.
    const adminUses = src.split("getSupabaseAdmin()").length - 1;
    expect(adminUses).toBe(1);
    expect(src).toContain("getSupabaseAdmin().storage");
    expect(src).not.toMatch(/getSupabaseAdmin\(\)\s*\.from\(/);
  });

  test("a delete that half-fails says the document is in the library", () => {
    // The unlink lands first, so a failed delete leaves the document filed
    // in the library rather than lost. Saying "nothing happened" would send
    // the Secretary looking for it on the meeting.
    expect(src).toContain("It is in the library.");
  });
});

describe("sign-in does not reveal the roster", () => {
  const src = code(readFileSync(join(ROOT, "app/api/board/signin/route.ts"), "utf8"));

  test("an address that is not on the roster gets the same response and no email", () => {
    // The not-on-roster branch returns the shared GENERIC body and must never
    // call signInWithOtp.
    const notOnRoster = src.slice(src.indexOf("if (!ok)"), src.indexOf("const supabase"));
    expect(notOnRoster).toContain("NextResponse.json(GENERIC)");
    expect(notOnRoster).not.toContain("signInWithOtp");
  });

  test("the success and failure bodies are the same object", () => {
    // Both paths return GENERIC, so the two responses cannot be told apart.
    const returns = src.match(/return NextResponse\.json\(([^)]*)\)/g) ?? [];
    const nonError = returns.filter((r) => !r.includes("status") && !r.includes("error"));
    expect(nonError.length).toBeGreaterThanOrEqual(2);
    for (const r of nonError) expect(r).toContain("GENERIC");
  });

  test("the email is trimmed and lowercased before the roster lookup", () => {
    expect(src).toContain("raw.trim().toLowerCase()");
  });
});

describe("board migration hygiene", () => {
  const sql = readFileSync(join(ROOT, "supabase/migrations/create_board_portal.sql"), "utf8");

  test("prep completion is private to each director", () => {
    expect(sql).toContain('create policy "own prep read"');
    expect(sql).toContain('create policy "own prep write"');
  });

  test("approved minutes are frozen", () => {
    expect(sql).toContain("minutes_freeze_when_approved");
    expect(sql).toContain("are approved and immutable");
  });
});
