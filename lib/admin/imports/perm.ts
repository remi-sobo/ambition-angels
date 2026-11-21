import type { Permission } from "@/lib/admin/requirePermission";
import type { ImportEntityType } from "./engine";

/**
 * The permission an import needs, by target (matches private.import_perm in
 * the database): participants are program data; donors and gifts are
 * fundraising data. The routes open with requirePermission(any of the two),
 * then hold the run to its own module with this, so a fundraising-only role
 * can't import participants and the reverse.
 */
export function importPerm(entity: ImportEntityType | string, verb: "read" | "write"): Permission {
  return entity === "student" ? (`program.${verb}` as Permission) : (`fundraising.${verb}` as Permission);
}

export const isImportEntity = (v: unknown): v is ImportEntityType => v === "student" || v === "constituent" || v === "gift";

export const auditDomain = (entity: string) => (entity === "student" ? "program" : "fundraising");
