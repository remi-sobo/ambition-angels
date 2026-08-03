import { describe, expect, test } from "vitest";
import {
  DOC_TYPES,
  DOC_TYPE_LABEL,
  docTypeExpires,
  minExpirationISO,
} from "@/lib/documents/config";

// Shannon's report: the upload form's only date field wrote expires_at, there
// was no insurance type, and past expiration dates were accepted. These pin
// the config side of the fix.
describe("documents config — insurance type and expiration rules", () => {
  test("insurance is a document type with a label", () => {
    expect(DOC_TYPES).toContain("insurance");
    expect(DOC_TYPE_LABEL.insurance).toBe("Insurance");
  });

  // Shannon again: finance and compliance files had nowhere to land.
  test("financial and compliance are document types with labels", () => {
    expect(DOC_TYPES).toContain("financial");
    expect(DOC_TYPE_LABEL.financial).toBe("Financial");
    expect(DOC_TYPES).toContain("compliance");
    expect(DOC_TYPE_LABEL.compliance).toBe("Compliance");
  });

  test("every doc type has a label", () => {
    for (const t of DOC_TYPES) expect(DOC_TYPE_LABEL[t]).toBeTruthy();
  });

  test("only insurance carries an expiration date in the upload forms", () => {
    expect(docTypeExpires("insurance")).toBe(true);
    for (const t of DOC_TYPES.filter((t) => t !== "insurance")) {
      expect(docTypeExpires(t)).toBe(false);
    }
  });

  test("minExpirationISO is tomorrow — today and past dates are not valid expiries", () => {
    const min = minExpirationISO(new Date(2026, 6, 29)); // local Jul 29, 2026
    expect(min).toBe("2026-07-30");
    expect("2026-07-29" < min).toBe(true); // today rejected
    expect("2023-08-31" < min).toBe(true); // past rejected
    expect("2026-07-30" < min).toBe(false); // tomorrow accepted
  });

  test("minExpirationISO rolls over month and year boundaries", () => {
    expect(minExpirationISO(new Date(2026, 11, 31))).toBe("2027-01-01");
  });
});
