import { describe, expect, test, vi } from "vitest";

// Custom-field registry validator (participant spine, spec #4 D1). The contract:
// unknown keys are rejected (the JSON can't drift from the registry), each value
// is type/option-checked, empty clears unless required, partial edits touch only
// provided keys, and requireAll (the create path) demands every required field.

// getFieldDefs uses React's RSC-only cache + the session supabase client at
// module scope; stub both so the pure validator under test imports cleanly.
vi.mock("server-only", () => ({}));
vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: <T,>(fn: T) => fn };
});
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));

import { validateAndMerge, formatFieldValue, type CustomFieldDef } from "@/lib/admin/customFields";

const def = (over: Partial<CustomFieldDef> & { key: string; field_type: CustomFieldDef["field_type"] }): CustomFieldDef => ({
  label: over.key,
  options: null,
  required: false,
  sort_order: 0,
  ...over,
});

const GRADE = def({ key: "grade", field_type: "select", label: "Grade", options: ["9", "10", "11", "12"] });
const SCHOOL = def({ key: "school", field_type: "text", label: "School" });
const GPA = def({ key: "gpa", field_type: "number", label: "GPA" });
const DOB = def({ key: "dob", field_type: "date", label: "DOB" });
const CONSENT = def({ key: "consent", field_type: "boolean", label: "Consent" });
const LANGS = def({ key: "langs", field_type: "multiselect", label: "Languages", options: ["en", "es", "fr"] });

describe("unknown keys", () => {
  test("a key not in the registry is rejected", () => {
    const r = validateAndMerge([SCHOOL], {}, { nope: "x" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/unknown field/i);
  });
  test("empty registry rejects any incoming key (AA today)", () => {
    expect(validateAndMerge([], {}, { grade: "9" }).ok).toBe(false);
  });
  test("empty registry + empty incoming is a clean no-op", () => {
    const r = validateAndMerge([], { pre: 1 }, {});
    expect(r).toEqual({ ok: true, value: { pre: 1 } });
  });
});

describe("type + option checks", () => {
  test("select must be an allowed option", () => {
    expect(validateAndMerge([GRADE], {}, { grade: "13" }).ok).toBe(false);
    expect(validateAndMerge([GRADE], {}, { grade: "9" })).toEqual({ ok: true, value: { grade: "9" } });
  });
  test("number rejects non-numeric (and booleans)", () => {
    expect(validateAndMerge([GPA], {}, { gpa: "abc" }).ok).toBe(false);
    expect(validateAndMerge([GPA], {}, { gpa: true }).ok).toBe(false);
    expect(validateAndMerge([GPA], {}, { gpa: "3.7" })).toEqual({ ok: true, value: { gpa: 3.7 } });
  });
  test("date must be ISO", () => {
    expect(validateAndMerge([DOB], {}, { dob: "07/16/2026" }).ok).toBe(false);
    expect(validateAndMerge([DOB], {}, { dob: "2011-05-02" }).ok).toBe(true);
  });
  test("boolean accepts bool or 'true'/'false'", () => {
    expect(validateAndMerge([CONSENT], {}, { consent: "true" })).toEqual({ ok: true, value: { consent: true } });
    expect(validateAndMerge([CONSENT], {}, { consent: "maybe" }).ok).toBe(false);
  });
  test("multiselect: array of allowed options, de-duped", () => {
    expect(validateAndMerge([LANGS], {}, { langs: ["en", "en", "es"] })).toEqual({ ok: true, value: { langs: ["en", "es"] } });
    expect(validateAndMerge([LANGS], {}, { langs: ["en", "de"] }).ok).toBe(false);
    expect(validateAndMerge([LANGS], {}, { langs: "en" }).ok).toBe(false);
  });
  test("text/email normalize", () => {
    expect(validateAndMerge([SCHOOL], {}, { school: "  Gunn High  " })).toEqual({ ok: true, value: { school: "Gunn High" } });
    const EMAIL = def({ key: "gm", field_type: "email", label: "Guardian mail" });
    expect(validateAndMerge([EMAIL], {}, { gm: "A@B.COM" })).toEqual({ ok: true, value: { gm: "a@b.com" } });
    expect(validateAndMerge([EMAIL], {}, { gm: "nope" }).ok).toBe(false);
  });
});

describe("empty / required / merge precedence", () => {
  test("empty value clears an optional key", () => {
    expect(validateAndMerge([SCHOOL], { school: "Gunn" }, { school: "" })).toEqual({ ok: true, value: {} });
  });
  test("clearing a required field is rejected", () => {
    const r = validateAndMerge([def({ ...SCHOOL, required: true })], { school: "Gunn" }, { school: "" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/required/i);
  });
  test("partial edit only touches provided keys", () => {
    const r = validateAndMerge([GRADE, SCHOOL], { grade: "9", school: "Gunn" }, { school: "Paly" });
    expect(r).toEqual({ ok: true, value: { grade: "9", school: "Paly" } });
  });
  test("requireAll (create) demands every required field", () => {
    const req = [def({ ...GRADE, required: true }), SCHOOL];
    expect(validateAndMerge(req, {}, { school: "Gunn" }, { requireAll: true }).ok).toBe(false);
    expect(validateAndMerge(req, {}, { grade: "9", school: "Gunn" }, { requireAll: true }).ok).toBe(true);
  });
  test("without requireAll (edit), a newly-required field absent from the row is NOT forced", () => {
    const req = [def({ ...GRADE, required: true }), SCHOOL];
    // editing only school on an old record that never had grade → allowed
    expect(validateAndMerge(req, { school: "Gunn" }, { school: "Paly" }).ok).toBe(true);
  });
});

describe("formatFieldValue", () => {
  test("renders booleans, multiselect, and empties", () => {
    expect(formatFieldValue(CONSENT, true)).toBe("Yes");
    expect(formatFieldValue(LANGS, ["en", "es"])).toBe("en, es");
    expect(formatFieldValue(SCHOOL, "")).toBe("—");
    expect(formatFieldValue(GRADE, "9")).toBe("9");
  });
});
