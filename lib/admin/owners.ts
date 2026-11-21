import type { OwnedTable } from "@/lib/database.types";
import type { Permission } from "@/lib/admin/requirePermission";

/**
 * Assignment (V4 Stage B2, spec §12 "add owner_id to constituents, asks,
 * cohorts and programs, with a default and a bulk-assign action").
 *
 * PURE: safe for client components and tests. The server half (who is a
 * member of the active org) lives in owners-server.ts.
 *
 * Rules:
 *  - an owner is a member of the ACTIVE org (memberships), never anyone else;
 *  - a record created through the app is owned by its creator unless the
 *    request names an owner (resolveCreateOwner);
 *  - ownership drives "mine" views; it never changes who can see a row;
 *  - asks.owner (free text) is shown until owner_id is set (ownerLabel).
 */

export type OrgMember = {
  userId: string;
  name: string;
  role: string | null;
};

/** The entities the assign route accepts, and the permission each needs. */
export const OWNED_ENTITIES: Record<OwnedTable, { permission: Permission; noun: { one: string; many: string } }> = {
  constituents: { permission: "fundraising.write", noun: { one: "donor", many: "donors" } },
  asks: { permission: "fundraising.write", noun: { one: "ask", many: "asks" } },
  cohorts: { permission: "program.write", noun: { one: "cohort", many: "cohorts" } },
  programs: { permission: "program.write", noun: { one: "program", many: "programs" } },
};

export function isOwnedEntity(v: unknown): v is OwnedTable {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(OWNED_ENTITIES, v);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Most rows one bulk assign may touch (one page of a list is 50). */
export const ASSIGN_MAX_IDS = 200;

/**
 * Parse the requested owner: a uuid assigns, null or "" unassigns.
 * Anything else is invalid (undefined).
 */
export function parseOwnerId(v: unknown): string | null | undefined {
  if (v === null || v === "") return null;
  return isUuid(v) ? v.toLowerCase() : undefined;
}

/**
 * The owner for a record being created. An explicit owner_id in the request
 * wins (null included: "create it unassigned"); otherwise the creator.
 * Returns undefined when the request carried an invalid value.
 */
export function resolveCreateOwner(body: Record<string, unknown> | null | undefined, creatorId: string): string | null | undefined {
  if (body && Object.prototype.hasOwnProperty.call(body, "owner_id")) return parseOwnerId(body.owner_id);
  return creatorId;
}

/** Members who can own work: board viewers read; they do not own records. */
export function assignableMembers(members: OrgMember[]): OrgMember[] {
  return members
    .filter((m) => m.role !== "board_viewer")
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Picker options: "Unassigned" first, then members by name. `meId` reads "(you)". */
export function ownerOptions(members: OrgMember[], meId?: string | null): { value: string; label: string }[] {
  return [
    { value: "", label: "Unassigned" },
    ...assignableMembers(members).map((m) => ({ value: m.userId, label: m.userId === meId ? `${m.name} (you)` : m.name })),
  ];
}

/**
 * What an owner chip says. owner_id resolves to the member's display name;
 * an owner_id that is no longer a member reads "Former member"; with no
 * owner_id, the free-text fallback (asks.owner), else null (unassigned).
 */
export function ownerLabel(
  ownerId: string | null | undefined,
  members: OrgMember[],
  fallbackText?: string | null,
): string | null {
  if (ownerId) {
    const m = members.find((x) => x.userId === ownerId);
    return m ? m.name : "Former member";
  }
  const text = fallbackText?.trim();
  return text ? text : null;
}
