import { createHash } from "crypto";
import Papa from "papaparse";
import { validateAndMerge, type CustomFieldDef } from "@/lib/admin/customFields";

/**
 * Import engine (spec #5 E2) — the pure core of the staged import layer.
 *
 * Everything here is deterministic and DB-free so the rules are unit-tested
 * directly: CSV parsing, column→field mapping, row normalization + validation,
 * content fingerprints, and duplicate verdicts. The server pieces (E3) load
 * the org's registry/stages/email index, then drive these functions row by
 * row and write the results to import_rows / the target entity.
 *
 * One integrity gate: custom-field values go through validateAndMerge — the
 * same validator the forms and API routes use. This module adds coercion
 * conveniences for file-shaped input (dates in M/D/YYYY, yes/no booleans,
 * semicolon-separated multiselects) but never its own registry rules.
 */

export type ImportEntityType = "student" | "constituent";

// ── Spine fields ────────────────────────────────────────────────────────────
// The universal columns an import may target, per entity. `kind` drives
// coercion; everything lands as a string except where noted. Custom fields
// (the org's registry) extend this list at mapping time.

export type SpineFieldKind = "text" | "email" | "phone" | "date" | "stage" | "enum";

export type SpineField = {
  key: string;
  label: string;
  kind: SpineFieldKind;
  required?: boolean;
  maxLen?: number;
  /** Allowed values for kind 'enum'. */
  options?: string[];
};

export const SPINE_FIELDS: Record<ImportEntityType, SpineField[]> = {
  student: [
    { key: "first_name", label: "First name", kind: "text", required: true, maxLen: 120 },
    { key: "last_name", label: "Last name", kind: "text", maxLen: 120 },
    { key: "email", label: "Email", kind: "email" },
    { key: "phone", label: "Phone", kind: "phone" },
    { key: "location", label: "Location", kind: "text", maxLen: 120 },
    { key: "stage", label: "Stage", kind: "stage" },
    { key: "notes", label: "Notes", kind: "text", maxLen: 2000 },
  ],
  constituent: [
    { key: "type", label: "Type", kind: "enum", options: ["person", "organization"] },
    { key: "first_name", label: "First name", kind: "text", maxLen: 120 },
    { key: "last_name", label: "Last name", kind: "text", maxLen: 120 },
    { key: "org_name", label: "Organization name", kind: "text", maxLen: 200 },
    { key: "email", label: "Email", kind: "email" },
    { key: "phone", label: "Phone", kind: "phone" },
    { key: "street", label: "Street", kind: "text", maxLen: 200 },
    { key: "city", label: "City", kind: "text", maxLen: 120 },
    { key: "state", label: "State", kind: "text", maxLen: 40 },
    { key: "postal_code", label: "Postal code", kind: "text", maxLen: 20 },
    { key: "notes", label: "Notes", kind: "text", maxLen: 2000 },
  ],
};

// ── CSV parsing ─────────────────────────────────────────────────────────────

export type ParsedCsv = {
  header: string[];
  /** Data rows, each padded/truncated to header length. */
  rows: string[][];
  errors: string[];
};

/** Parse CSV text (handles quoting, BOM, CRLF via papaparse). Trims cells. */
export function parseCsvText(text: string): ParsedCsv {
  const res = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  const errors = res.errors.map((e) => `Row ${e.row != null ? e.row + 1 : "?"}: ${e.message}`);
  const all = (res.data ?? []).map((r) => r.map((c) => (c ?? "").trim()));
  if (all.length === 0) return { header: [], rows: [], errors: [...errors, "File is empty"] };
  const header = all[0];
  const rows = all.slice(1).map((r) => {
    const out = r.slice(0, header.length);
    while (out.length < header.length) out.push("");
    return out;
  });
  return { header, rows, errors };
}

// ── Mapping ─────────────────────────────────────────────────────────────────
// mapping: CSV column name → target field key ("" / absent = ignore the
// column). A target is either a spine key or a registry def key; spine wins a
// name collision (registry keys shouldn't shadow spine keys — flagged here).

export type Mapping = Record<string, string>;

export function validateMapping(
  mapping: Mapping,
  header: string[],
  entity: ImportEntityType,
  defs: CustomFieldDef[],
): { ok: true } | { ok: false; error: string } {
  const spineKeys = new Set(SPINE_FIELDS[entity].map((f) => f.key));
  const customKeys = new Set(defs.map((d) => d.key));
  const headerSet = new Set(header);
  const seen = new Map<string, string>(); // target → column
  for (const [column, target] of Object.entries(mapping)) {
    if (!target) continue;
    if (!headerSet.has(column)) return { ok: false, error: `Mapped column "${column}" is not in the file` };
    if (!spineKeys.has(target) && !customKeys.has(target)) {
      return { ok: false, error: `"${target}" is not a field of this ${entity === "constituent" ? "constituent" : "participant"} (spine or custom)` };
    }
    const prev = seen.get(target);
    if (prev) return { ok: false, error: `Both "${prev}" and "${column}" map to "${target}"` };
    seen.set(target, column);
  }
  for (const key of Array.from(customKeys)) {
    if (spineKeys.has(key)) {
      return { ok: false, error: `Custom field key "${key}" shadows a built-in field — rename the custom field` };
    }
  }
  if (seen.size === 0) return { ok: false, error: "Map at least one column" };
  return { ok: true };
}

/** Best-effort auto-mapping by normalized header name, for the wizard's initial state. */
export function suggestMapping(
  header: string[],
  entity: ImportEntityType,
  defs: CustomFieldDef[],
): Mapping {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const targets = new Map<string, string>(); // normalized name → field key
  for (const f of SPINE_FIELDS[entity]) {
    targets.set(norm(f.key), f.key);
    targets.set(norm(f.label), f.key);
  }
  for (const d of defs) {
    if (!targets.has(norm(d.key))) targets.set(norm(d.key), d.key);
    if (!targets.has(norm(d.label))) targets.set(norm(d.label), d.key);
  }
  const mapping: Mapping = {};
  const used = new Set<string>();
  for (const column of header) {
    const hit = targets.get(norm(column));
    if (hit && !used.has(hit)) {
      mapping[column] = hit;
      used.add(hit);
    }
  }
  return mapping;
}

/** Apply the mapping to one raw row → { fieldKey: rawString } (unmapped columns dropped). */
export function normalizeRow(header: string[], row: string[], mapping: Mapping): Record<string, string> {
  const out: Record<string, string> = {};
  header.forEach((column, i) => {
    const target = mapping[column];
    if (target) out[target] = (row[i] ?? "").trim();
  });
  return out;
}

// ── Value coercion (file-shaped input → validator-shaped input) ─────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** "2013-06-01" passes through; "6/1/2013" → "2013-06-01"; anything else unchanged. */
export function toIsoDate(raw: string): string {
  if (ISO_DATE.test(raw)) return raw;
  const m = US_DATE.exec(raw);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return raw;
}

const TRUTHY = new Set(["true", "yes", "y", "1"]);
const FALSY = new Set(["false", "no", "n", "0"]);

/** Reshape a CSV cell for a custom-field def so validateAndMerge can judge it. */
function coerceCustomCell(def: CustomFieldDef, raw: string): unknown {
  switch (def.field_type) {
    case "boolean": {
      const v = raw.toLowerCase();
      if (TRUTHY.has(v)) return "true";
      if (FALSY.has(v)) return "false";
      return raw;
    }
    case "date":
      return toIsoDate(raw);
    case "number":
      return raw;
    case "multiselect":
      // Semicolon-separated in a CSV cell (comma is the file delimiter).
      return raw.split(";").map((s) => s.trim()).filter(Boolean);
    default:
      return raw;
  }
}

// ── Row build (normalize → validated spine + custom values) ─────────────────

export type BuildContext = {
  entity: ImportEntityType;
  defs: CustomFieldDef[];
  /** The org's stage keys (participants). Empty allowed if stage isn't mapped. */
  stageKeys: ReadonlySet<string>;
};

export type BuiltRow =
  | { ok: true; spine: Record<string, unknown>; custom: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Validate one normalized row into insert-ready values. Spine fields follow
 * the same rules the API routes enforce; custom fields go through
 * validateAndMerge (requireAll off — legacy rosters predate required fields,
 * spec §6c). Empty cells are simply absent.
 */
export function buildRow(normalized: Record<string, string>, ctx: BuildContext): BuiltRow {
  const spineByKey = new Map(SPINE_FIELDS[ctx.entity].map((f) => [f.key, f]));
  const customByKey = new Map(ctx.defs.map((d) => [d.key, d]));
  const spine: Record<string, unknown> = {};
  const customRaw: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(normalized)) {
    const sf = spineByKey.get(key);
    if (sf) {
      if (raw === "") continue;
      switch (sf.kind) {
        case "text":
          spine[key] = raw.slice(0, sf.maxLen ?? 200);
          break;
        case "email": {
          if (!raw.includes("@")) return { ok: false, error: `${sf.label}: "${raw}" is not an email` };
          spine[key] = raw.toLowerCase().slice(0, 200);
          break;
        }
        case "phone":
          spine[key] = raw.slice(0, 40);
          break;
        case "date": {
          const iso = toIsoDate(raw);
          if (!ISO_DATE.test(iso)) return { ok: false, error: `${sf.label}: "${raw}" is not a date` };
          spine[key] = iso;
          break;
        }
        case "stage": {
          if (!ctx.stageKeys.has(raw)) {
            return { ok: false, error: `${sf.label}: "${raw}" is not one of this org's stages` };
          }
          spine[key] = raw;
          break;
        }
        case "enum": {
          const v = raw.toLowerCase();
          if (!sf.options?.includes(v)) {
            return { ok: false, error: `${sf.label}: "${raw}" must be one of ${sf.options?.join(", ")}` };
          }
          spine[key] = v;
          break;
        }
      }
      continue;
    }
    const def = customByKey.get(key);
    if (def) {
      if (raw === "") continue;
      customRaw[key] = coerceCustomCell(def, raw);
      continue;
    }
    return { ok: false, error: `Unknown field "${key}"` };
  }

  // Identity requirements.
  if (ctx.entity === "student") {
    if (typeof spine.first_name !== "string" || !spine.first_name) {
      return { ok: false, error: "First name is required" };
    }
  } else {
    if (!spine.first_name && !spine.last_name && !spine.org_name) {
      return { ok: false, error: "A name is required (first/last or organization)" };
    }
  }

  const merged = validateAndMerge(ctx.defs, {}, customRaw, { requireAll: false });
  if (!merged.ok) return { ok: false, error: merged.error };
  return { ok: true, spine, custom: merged.value };
}

// ── Fingerprint + dedupe verdict ────────────────────────────────────────────

/**
 * Content-stable fingerprint of a raw row — the CSV external_id. Stable across
 * uploads of the same file (unlike an import-id-scoped ref), which is what
 * makes DoD #2 ("re-upload → zero new rows") hold via the external_refs
 * unique key. NUL-joined so ["a","bc"] and ["ab","c"] differ.
 */
export function rowFingerprint(raw: string[]): string {
  return createHash("sha256").update(raw.join("\0")).digest("hex").slice(0, 32);
}

/** Emails that identify this row for duplicate matching, lowercased. */
export function dedupeEmails(entity: ImportEntityType, built: { spine: Record<string, unknown>; custom: Record<string, unknown> }): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.includes("@")) out.push(v.toLowerCase());
  };
  push(built.spine.email);
  if (entity === "student") push(built.custom.guardian_email);
  return out;
}

export type Verdict =
  | { verdict: "create" }
  | { verdict: "skip"; reason: "already_imported" | "matches_existing"; matchedEntityId: string | null };

/**
 * Verdict precedence (spec §6c): a ledger hit (this exact row was imported
 * before) beats an email match beats create. Pure — the caller resolves the
 * fingerprint against external_refs and the emails against the org's rows.
 */
export function verdictFor(fingerprintHit: boolean, emailMatchId: string | null): Verdict {
  if (fingerprintHit) return { verdict: "skip", reason: "already_imported", matchedEntityId: null };
  if (emailMatchId) return { verdict: "skip", reason: "matches_existing", matchedEntityId: emailMatchId };
  return { verdict: "create" };
}
