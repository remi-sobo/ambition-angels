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
