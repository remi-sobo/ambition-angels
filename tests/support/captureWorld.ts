/**
 * One small org for the Capture C3 tests: the owner's capture, a donor, a
 * partner, two staff who can take tasks, and an RLS-ish fake session client
 * (tests/support/fakeDb.ts) where capture rows are personal and the
 * destination tables carry their real provenance unique keys.
 */

import { vi } from "vitest";
import type { ActionDeps } from "@/lib/capture/confirm";
import type { CardRow, CaptureRow } from "@/lib/capture/apply";
import { fakeDb, type FakeDbOptions } from "./fakeDb";

export const ORG = "00000000-0000-0000-0000-00000000a0a0";
export const OTHER_ORG = "00000000-0000-0000-0000-00000000b0b0";
export const OWNER = "00000000-0000-0000-0000-000000000001";
export const STAFF = "00000000-0000-0000-0000-000000000002";
export const CAPTURE_ID = "00000000-0000-0000-0000-00000000c001";
export const MARISOL = "00000000-0000-0000-0000-00000000d001";
export const ARCHIVED = "00000000-0000-0000-0000-00000000d002";
export const FOREIGN = "00000000-0000-0000-0000-00000000d003";
export const HARBOR = "00000000-0000-0000-0000-00000000e001";
export const PROSPECT = "00000000-0000-0000-0000-00000000f001";

export const T0 = Date.parse("2026-10-09T17:00:00Z");

let seq = 0;
export function cardId(): string {
  seq += 1;
  return `00000000-0000-0000-0000-${String(0xca000000 + seq).padStart(12, "0")}`;
}

export function card(over: Partial<CardRow> = {}): CardRow {
  return {
    id: cardId(),
    org_id: ORG,
    capture_id: CAPTURE_ID,
    created_by: OWNER,
    position: 0,
    dest: "task",
    status: "proposed",
    entity_type: null,
    entity_id: null,
    heard_name: null,
    match_confidence: null,
    match_candidates: [],
    payload: { title: "Send the one-pager", category: "fundraising", notes: null, due_date: null, assignee: null },
    decided_by: null,
    decided_at: null,
    applied_table: null,
    applied_id: null,
    ...over,
  };
}

export const interactionCard = (over: Partial<CardRow> = {}) =>
  card({
    dest: "interaction",
    entity_type: "constituent",
    entity_id: MARISOL,
    match_confidence: 0.95,
    match_candidates: [{ kind: "constituent", id: MARISOL, name: "Marisol Quintero", org_name: null, meta: "person" }],
    payload: { kind: "meeting", notes: "Coffee. Wants the impact numbers.", occurred_at: "2026-10-08", entity_name: "Marisol Quintero" },
    ...over,
  });

export const partnerCard = (over: Partial<CardRow> = {}) =>
  card({
    dest: "interaction",
    entity_type: "partner",
    entity_id: HARBOR,
    match_candidates: [{ kind: "partner", id: HARBOR, name: "Harbor Light Academy", org_name: null, meta: "school" }],
    payload: { kind: "call", notes: "Principal wants spring dates.", occurred_at: "2026-10-08", entity_name: "Harbor Light Academy" },
    ...over,
  });

export const thoughtCard = (over: Partial<CardRow> = {}) =>
  card({ dest: "thought", payload: { text: "What if alumni ran the spring showcase?", label: "parking-lot" }, ...over });

export const draftCard = (over: Partial<CardRow> = {}) =>
  card({
    dest: "message_draft",
    entity_type: "constituent",
    entity_id: MARISOL,
    payload: { channel: "email", subject: "Impact numbers", body: "Hi Marisol, here are the numbers.", recipient_name: "Marisol", entity_name: "Marisol Quintero" },
    ...over,
  });

export const CAPTURE: CaptureRow = { id: CAPTURE_ID, org_id: ORG, created_by: OWNER, status: "ready", model_used: "claude-sonnet-4-6" };

export type World = ReturnType<typeof world>;

export function world(cards: CardRow[], opts: { perms?: string[]; db?: FakeDbOptions; userId?: string } = {}) {
  let clock = T0;
  const userId = opts.userId ?? OWNER;
  const db = fakeDb(
    {
      captures: [{ ...CAPTURE, transcript: "x" }],
      capture_cards: cards,
      constituents: [
        { id: MARISOL, org_id: ORG, type: "person", first_name: "Marisol", last_name: "Quintero", org_name: null, archived_at: null },
        { id: ARCHIVED, org_id: ORG, type: "person", first_name: "Old", last_name: "Donor", org_name: null, archived_at: "2025-01-01T00:00:00Z" },
        { id: FOREIGN, org_id: OTHER_ORG, type: "person", first_name: "Other", last_name: "Tenant", org_name: null, archived_at: null },
      ],
      partners: [{ id: HARBOR, org_id: ORG, name: "Harbor Light Academy", last_touch_at: "2026-09-01" }],
      interactions: [],
      partner_interactions: [],
      ops_tasks: [],
      reed_drafts: [],
      role_permissions: [
        { role: "owner", permission: "ops.write" },
        { role: "staff", permission: "ops.write" },
      ],
      memberships: [
        { user_id: OWNER, org_id: ORG, role: "owner" },
        { user_id: STAFF, org_id: ORG, role: "staff" },
        { user_id: "00000000-0000-0000-0000-000000000005", org_id: ORG, role: "board_viewer" },
      ],
      profiles: [
        { user_id: OWNER, display_name: "Remi Sobomehin" },
        { user_id: STAFF, display_name: "Shannon Example" },
      ],
    },
    {
      unique: {
        interactions: [["external_source", "external_id", "constituent_id"]],
        partner_interactions: [["org_id", "external_source", "external_id", "partner_id"]],
      },
      visible: {
        captures: (r) => r.created_by === userId,
        capture_cards: (r) => r.created_by === userId,
        constituents: (r) => r.org_id === ORG,
        partners: (r) => r.org_id === ORG,
      },
      touchUpdatedAt: new Set(["ops_tasks", "reed_drafts", "partners", "capture_cards", "captures"]),
      now: () => new Date(clock),
      ...opts.db,
    },
  );
  const perms = new Set(opts.perms ?? ["fundraising.write", "program.write", "ops.write"]);
  const audit = vi.fn(async () => {});
  const deps: ActionDeps = {
    supabase: db.client,
    ctx: { orgId: ORG, userId, handle: "remi", audit },
    hasPermission: async (p) => perms.has(p),
    now: () => new Date(clock),
  };
  return {
    db,
    deps,
    audit,
    perms,
    advance: (ms: number) => {
      clock += ms;
    },
    cardRow: (id: string) => db.tables.capture_cards.find((c) => c.id === id) as unknown as CardRow,
    captureStatus: () => db.tables.captures[0].status,
  };
}
