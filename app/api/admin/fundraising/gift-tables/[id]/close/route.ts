import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { closeSnapshot } from "@/lib/fundraising/gift-table";
import { loadGiftTableSpine } from "@/lib/fundraising/gift-table-server";

/**
 * Close, reopen and archive a gift table (specs/fundraising-gift-tables.md,
 * Phase 5).
 *
 * Closing is the only moment plan vs actual can be captured honestly. The
 * spine keeps moving after a window ends — a gift lands late, a stage is
 * corrected, a level is edited for next year — so a "what happened" figure
 * derived live months later answers a different question than the one anyone
 * asked. The snapshot is written ONCE, here, from the same loader the detail
 * page renders (Phase 5 · one spine), and the page afterwards shows the frozen
 * numbers beside the live ones rather than quietly replacing them.
 *
 * Reopening does NOT erase the snapshot. It records that this table was closed
 * on a date with those numbers; re-closing overwrites it with the new reading.
 * Deleting that history to make the UI simpler would destroy the only record
 * of what the table looked like when someone decided it was done.
 *
 * Archiving is separate from closing on purpose: closed means "finished, and
 * here is how it went", archived means "stop showing me this". A table must be
 * closed before it can be archived, so nothing can be filed away with its
 * result unrecorded.
 */

type Action = "close" | "reopen" | "archive" | "unarchive";

const ACTIONS: readonly Action[] = ["close", "reopen", "archive", "unarchive"];

/** What each action requires the table to be, and what it leaves it as. */
const TRANSITIONS: Record<Action, { from: readonly string[]; to: string; refuse: string }> = {
  close: {
    from: ["active"],
    to: "closed",
    refuse: "Only an active table can be closed.",
  },
  reopen: {
    from: ["closed"],
    to: "active",
    refuse: "Only a closed table can be reopened. Unarchive it first.",
  },
  archive: {
    from: ["closed"],
    to: "archived",
    refuse: "Close the table before archiving it, so its result is recorded.",
  },
  unarchive: {
    from: ["archived"],
    to: "closed",
    refuse: "Only an archived table can be unarchived.",
  },
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (typeof action !== "string" || !ACTIONS.includes(action as Action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const move = TRANSITIONS[action as Action];

  const supabase = createServerSupabase();
  const spine = await loadGiftTableSpine(supabase, ctx.orgId, params.id);
  if (!spine) return NextResponse.json({ error: "Gift table not found" }, { status: 404 });

  const before = spine.table.status;
  if (!move.from.includes(before)) {
    return NextResponse.json({ error: move.refuse }, { status: 409 });
  }

  const update: Record<string, unknown> = { status: move.to };

  if (action === "close") {
    const closedOn = new Date().toISOString().slice(0, 10);
    update.closed_at = new Date().toISOString();
    // Frozen from the SAME derivation the page renders. Nothing here
    // recomputes a level's value on its own.
    update.closed_snapshot = closeSnapshot({
      table: spine.table,
      slots: spine.slots,
      goal: spine.goal,
      shape: spine.shape,
      gaps: spine.gaps,
      closedOn,
    });
  }

  const { error } = await supabase
    .from("fr_gift_tables")
    .update(update)
    .eq("id", params.id)
    .eq("org_id", ctx.orgId);
  if (error) {
    console.error(`Gift table ${action} failed:`, error.message);
    return NextResponse.json({ error: `Could not ${action} the gift table` }, { status: 500 });
  }

  await audit(req, {
    action: `fundraising.gift_table.${action}`,
    entityType: "fr_gift_table",
    entityId: params.id,
    before: { status: before },
    // The snapshot itself is not repeated into the audit row: it already lives
    // on the table, and copying a whole level-by-level reading into every
    // audit entry would bury the one fact this row exists to record.
    after: { status: move.to },
  });

  return NextResponse.json({ ok: true, status: move.to });
}
