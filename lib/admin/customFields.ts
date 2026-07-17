import "server-only";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Custom-field registry (participant spine, spec #4 D1).
 *
 * A per-org, per-entity set of field definitions drives the form, validation,
 * and display for a tenant's own fields — an org adds a field with one INSERT
 * into custom_field_defs, no deploy. Values live in a `custom_fields` jsonb
 * column on the entity; this module is the only writer-side gate that keeps
 * that JSON consistent with the registry.
 *
 * `getFieldDefs` reads on the SESSION client (RLS: program.read), request-
 * cached. `validateAndMerge` is pure (no DB) so the precedence rules are unit-
 * tested directly.
 */

export type CustomFieldType =
  | "text" | "number" | "date" | "select" | "multiselect" | "boolean" | "phone" | "email";

export type CustomFieldDef = {
  key: string;
  label: string;
  field_type: CustomFieldType;
  /** Allowed values for select/multiselect; null otherwise. */
  options: string[] | null;
  required: boolean;
  sort_order: number;
};

/** Org's field defs for one entity type, sorted for rendering. Request-cached. */
export const getFieldDefs = cache(
  async (orgId: string, entityType: string): Promise<CustomFieldDef[]> => {
    const sb = createServerSupabase();
    const { data } = await sb
      .from("custom_field_defs")
      .select("key, label, field_type, options, required, sort_order")
      .eq("org_id", orgId)
      .eq("entity_type", entityType)
      .eq("archived", false)
      .order("sort_order")
      .order("key");
    return (data ?? []) as CustomFieldDef[];
  },
);

export type MergeResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

type CoerceResult = { ok: true; value: unknown } | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function coerce(def: CustomFieldDef, raw: unknown): CoerceResult {
  const bad = (why: string): CoerceResult => ({ ok: false, error: `${def.label}: ${why}` });
  switch (def.field_type) {
    case "text": {
      if (typeof raw !== "string") return bad("must be text");
      return { ok: true, value: raw.trim().slice(0, 2000) };
    }
    case "phone": {
      if (typeof raw !== "string") return bad("must be text");
      return { ok: true, value: raw.trim().slice(0, 40) };
    }
    case "email": {
      if (typeof raw !== "string" || !raw.includes("@")) return bad("must be an email");
      return { ok: true, value: raw.trim().toLowerCase().slice(0, 200) };
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (typeof raw === "boolean" || !Number.isFinite(n)) return bad("must be a number");
      return { ok: true, value: n };
    }
    case "date": {
      if (typeof raw !== "string" || !ISO_DATE.test(raw)) return bad("must be a date (YYYY-MM-DD)");
      return { ok: true, value: raw };
    }
    case "boolean": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      if (raw === "true") return { ok: true, value: true };
      if (raw === "false") return { ok: true, value: false };
      return bad("must be true or false");
    }
    case "select": {
      if (typeof raw !== "string") return bad("must be a single choice");
      if (!def.options?.includes(raw)) return bad(`"${raw}" is not an allowed option`);
      return { ok: true, value: raw };
    }
    case "multiselect": {
      if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string")) return bad("must be a list of choices");
      const opts = def.options ?? [];
      for (const x of raw as string[]) if (!opts.includes(x)) return bad(`"${x}" is not an allowed option`);
      return { ok: true, value: Array.from(new Set(raw as string[])) };
    }
    default:
      return bad("unknown field type");
  }
}

/**
 * Validate `incoming` custom-field values against the registry and merge onto
 * `current`. Pure. Rules:
 *  - only keys present in `incoming` are touched (partial edits are fine);
 *  - an unknown key (not in the registry) is rejected — the JSON can't drift;
 *  - an empty value clears the key, unless the field is required (→ error);
 *  - each value is type/option-checked and normalized;
 *  - opts.requireAll (the create path) additionally demands every required
 *    field end up present — on edit it's omitted so a newly-added required
 *    field doesn't retroactively brick existing records (spec §10 #4).
 */
export function validateAndMerge(
  defs: CustomFieldDef[],
  current: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
  opts: { requireAll?: boolean } = {},
): MergeResult {
  const merged: Record<string, unknown> = { ...(current ?? {}) };

  if (incoming && typeof incoming === "object" && !Array.isArray(incoming)) {
    const byKey = new Map(defs.map((d) => [d.key, d]));
    for (const k of Object.keys(incoming)) {
      if (!byKey.has(k)) return { ok: false, error: `Unknown field "${k}"` };
    }
    for (const def of defs) {
      if (!(def.key in incoming)) continue;
      const raw = incoming[def.key];
      if (isEmpty(raw)) {
        if (def.required) return { ok: false, error: `${def.label} is required` };
        delete merged[def.key];
        continue;
      }
      const c = coerce(def, raw);
      if (!c.ok) return c;
      merged[def.key] = c.value;
    }
  }

  if (opts.requireAll) {
    for (const def of defs) {
      if (def.required && isEmpty(merged[def.key])) {
        return { ok: false, error: `${def.label} is required` };
      }
    }
  }

  return { ok: true, value: merged };
}

/** Human-readable rendering of a stored value for display surfaces. */
export function formatFieldValue(def: CustomFieldDef, value: unknown): string {
  if (isEmpty(value)) return "—";
  switch (def.field_type) {
    case "boolean":
      return value ? "Yes" : "No";
    case "multiselect":
      return Array.isArray(value) ? (value as string[]).join(", ") : String(value);
    default:
      return String(value);
  }
}
