import { describe, expect, test, vi } from "vitest";

// Import engine (spec #5 E2). The contract under test: CSV parsing survives
// the classic traps (quoted commas, BOM, CRLF, ragged rows); mapping rejects
// unknown/duplicate targets; buildRow enforces spine rules and routes custom
// values through validateAndMerge (one integrity gate — registry rejection
// bubbles up verbatim); fingerprints are content-stable across runs; verdict
// precedence is ledger hit → email match → create.

// The engine imports validateAndMerge from customFields, which touches
// server-only + React cache + the session client at module scope — stub the
// platform bits exactly like tests/custom-fields.test.ts.
vi.mock("server-only", () => ({}));
vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: <T,>(fn: T) => fn };
});
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));

import type { CustomFieldDef } from "@/lib/admin/customFields";
import {
  parseCsvText,
  validateMapping,
  suggestMapping,
  normalizeRow,
  toIsoDate,
  buildRow,
  rowFingerprint,
  dedupeEmails,
  verdictFor,
  type BuildContext,
} from "@/lib/admin/imports/engine";

const def = (
  over: Partial<CustomFieldDef> & { key: string; field_type: CustomFieldDef["field_type"] },
): CustomFieldDef => ({
  label: over.key,
  options: null,
  required: false,
  sort_order: 0,
  ...over,
});

const DEFS: CustomFieldDef[] = [
  def({ key: "grade", field_type: "select", label: "Grade", options: ["7", "8", "9"] }),
  def({ key: "guardian_email", field_type: "email", label: "Guardian email" }),
  def({ key: "dob", field_type: "date", label: "DOB" }),
  def({ key: "tracks", field_type: "multiselect", label: "Tracks", options: ["art", "code"] }),
  def({ key: "consent", field_type: "boolean", label: "Consent" }),
];

const CTX: BuildContext = {
  entity: "student",
  defs: DEFS,
  stageKeys: new Set(["discover", "learn"]),
};

describe("parseCsvText", () => {
  test("plain file with CRLF and trailing newline", () => {
    const { header, rows, errors } = parseCsvText("a,b\r\n1,2\r\n3,4\r\n");
    expect(errors).toEqual([]);
    expect(header).toEqual(["a", "b"]);
    expect(rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  test("quoted commas and quotes survive", () => {
    const { rows } = parseCsvText('name,school\n"Okafor, Jaiye","St. ""Mary"" Prep"\n');
    expect(rows).toEqual([["Okafor, Jaiye", 'St. "Mary" Prep']]);
  });

  test("BOM is not glued to the first header", () => {
    const { header } = parseCsvText("﻿first_name,email\nJaiye,j@x.org\n");
    expect(header[0]).toBe("first_name");
  });

  test("ragged rows are padded/truncated to the header width", () => {
    const { rows } = parseCsvText("a,b,c\n1,2\n1,2,3,4\n");
    expect(rows).toEqual([["1", "2", ""], ["1", "2", "3"]]);
  });

  test("empty file reports instead of exploding", () => {
    const { errors } = parseCsvText("");
    expect(errors.some((e) => e.includes("empty"))).toBe(true);
  });
});

describe("validateMapping", () => {
  const header = ["First Name", "Grade", "Guardian Email"];

  test("accepts spine + custom targets", () => {
    const r = validateMapping(
      { "First Name": "first_name", Grade: "grade", "Guardian Email": "guardian_email" },
      header, "student", DEFS,
    );
    expect(r).toEqual({ ok: true });
  });

  test("rejects a target that is neither spine nor registry", () => {
    const r = validateMapping({ "First Name": "shoe_size" }, header, "student", DEFS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("shoe_size");
  });

  test("rejects two columns mapping to one target", () => {
    const r = validateMapping(
      { "First Name": "first_name", Grade: "first_name" },
      header, "student", DEFS,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("first_name");
  });

  test("rejects a mapped column that is not in the file", () => {
    const r = validateMapping({ Ghost: "first_name" }, header, "student", DEFS);
    expect(r.ok).toBe(false);
  });

  test("rejects a registry key that shadows a spine key", () => {
    const shadow = [def({ key: "email", field_type: "text", label: "Email (custom)" })];
    const r = validateMapping({ "First Name": "first_name" }, header, "student", shadow);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("shadows");
  });

  test("rejects an empty mapping", () => {
    expect(validateMapping({}, header, "student", DEFS).ok).toBe(false);
  });
});

describe("suggestMapping", () => {
  test("matches by key, label, and normalized header spelling", () => {
    const m = suggestMapping(["First Name", "GUARDIAN EMAIL", "Grade", "Mystery"], "student", DEFS);
    expect(m).toEqual({ "First Name": "first_name", "GUARDIAN EMAIL": "guardian_email", Grade: "grade" });
  });

  test("never maps two columns to one target", () => {
    const m = suggestMapping(["Email", "email"], "student", DEFS);
    expect(Object.keys(m)).toHaveLength(1);
  });
});

describe("toIsoDate", () => {
  test.each([
    ["2013-06-01", "2013-06-01"],
    ["6/1/2013", "2013-06-01"],
    ["12/31/2013", "2013-12-31"],
    ["June 1 2013", "June 1 2013"], // unrecognized → unchanged, validator rejects
  ])("%s → %s", (input, expected) => {
    expect(toIsoDate(input)).toBe(expected);
  });
});

describe("buildRow (student)", () => {
  const header = ["First Name", "Last Name", "Email", "Stage", "Grade", "DOB", "Tracks", "Consent"];
  const mapping = {
    "First Name": "first_name", "Last Name": "last_name", Email: "email",
    Stage: "stage", Grade: "grade", DOB: "dob", Tracks: "tracks", Consent: "consent",
  };
  const build = (row: string[]) => buildRow(normalizeRow(header, row, mapping), CTX);

  test("a full row lands split into spine and validated custom values", () => {
    const r = build(["Jaiye", "Okafor", "JAIYE@X.ORG", "learn", "8", "6/1/2013", "art; code", "yes"]);
    expect(r).toEqual({
      ok: true,
      spine: { first_name: "Jaiye", last_name: "Okafor", email: "jaiye@x.org", stage: "learn" },
      custom: { grade: "8", dob: "2013-06-01", tracks: ["art", "code"], consent: true },
    });
  });

  test("empty cells are simply absent, not errors", () => {
    const r = build(["Jaiye", "", "", "", "", "", "", ""]);
    expect(r).toEqual({ ok: true, spine: { first_name: "Jaiye" }, custom: {} });
  });

  test("missing first name is an error", () => {
    const r = build(["", "Okafor", "", "", "", "", "", ""]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("First name");
  });

  test("a stage outside the org's set is an error", () => {
    const r = build(["Jaiye", "", "", "graduated", "", "", "", ""]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("stage");
  });

  test("registry rejection bubbles verbatim (bad select option)", () => {
    const r = build(["Jaiye", "", "", "", "13", "", "", ""]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not an allowed option");
  });

  test("bad multiselect member is rejected by the registry", () => {
    const r = build(["Jaiye", "", "", "", "", "", "art; music", ""]);
    expect(r.ok).toBe(false);
  });

  test("malformed spine email is an error", () => {
    const r = build(["Jaiye", "", "not-an-email", "", "", "", "", ""]);
    expect(r.ok).toBe(false);
  });
});

describe("buildRow (constituent)", () => {
  const ctx: BuildContext = { entity: "constituent", defs: [], stageKeys: new Set() };

  test("an organization row needs no person name", () => {
    const r = buildRow({ type: "Organization", org_name: "Sobrato" }, ctx);
    expect(r).toEqual({ ok: true, spine: { type: "organization", org_name: "Sobrato" }, custom: {} });
  });

  test("a row with no name at all is an error", () => {
    const r = buildRow({ email: "x@y.org" }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("name");
  });

  test("an unknown enum value is an error", () => {
    expect(buildRow({ type: "family", org_name: "X" }, ctx).ok).toBe(false);
  });
});

describe("rowFingerprint", () => {
  test("identical rows collide (that is the point), different rows do not", () => {
    expect(rowFingerprint(["a", "b"])).toBe(rowFingerprint(["a", "b"]));
    expect(rowFingerprint(["a", "b"])).not.toBe(rowFingerprint(["a", "c"]));
  });

  test("cell boundaries matter", () => {
    expect(rowFingerprint(["ab", "c"])).not.toBe(rowFingerprint(["a", "bc"]));
  });
});

describe("dedupeEmails", () => {
  test("student rows match on own email + guardian email", () => {
    expect(
      dedupeEmails("student", { spine: { email: "kid@x.org" }, custom: { guardian_email: "Mom@X.org" } }),
    ).toEqual(["kid@x.org", "mom@x.org"]);
  });

  test("constituent rows match on the spine email only", () => {
    expect(
      dedupeEmails("constituent", { spine: { email: "d@x.org" }, custom: { guardian_email: "m@x.org" } }),
    ).toEqual(["d@x.org"]);
  });
});

describe("verdictFor precedence", () => {
  test("ledger hit beats email match beats create", () => {
    expect(verdictFor(true, "abc")).toEqual({
      verdict: "skip", reason: "already_imported", matchedEntityId: null,
    });
    expect(verdictFor(false, "abc")).toEqual({
      verdict: "skip", reason: "matches_existing", matchedEntityId: "abc",
    });
    expect(verdictFor(false, null)).toEqual({ verdict: "create" });
  });
});

describe("idempotent re-upload (the DoD #2 mechanism)", () => {
  test("the same file parsed twice yields identical fingerprints row-for-row", () => {
    const file = 'first_name,email\n"Okafor, Jaiye",j@x.org\nAda,a@x.org\n';
    const first = parseCsvText(file).rows.map(rowFingerprint);
    const second = parseCsvText(file).rows.map(rowFingerprint);
    expect(second).toEqual(first);
    // …so every row of the second upload hits external_refs and skips.
    expect(first.map((fp) => verdictFor(true, null).verdict)).toEqual(["skip", "skip"]);
  });
});
