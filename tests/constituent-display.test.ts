import { describe, expect, test } from "vitest";
import { constituentName } from "../lib/fundraising/display";

// Donors imported from HubSpot as email-only contacts land with no name on the
// spine. The sync now backfills the name once HubSpot has one
// (fr_backfill_constituent_names_from_hubspot); for the ones HubSpot itself has
// no name for, the display falls back to the email instead of a placeholder —
// same thing HubSpot shows on the record.

const person = (p: Partial<Parameters<typeof constituentName>[0]> = {}) => ({
  type: "person",
  first_name: null,
  last_name: null,
  org_name: null,
  ...p,
});

describe("constituentName", () => {
  test("person with both names", () => {
    expect(constituentName(person({ first_name: "Lily", last_name: "Gu" }))).toBe("Lily Gu");
  });

  test("person with only a first name", () => {
    expect(constituentName(person({ first_name: "Lily" }))).toBe("Lily");
  });

  test("nameless person falls back to the first email", () => {
    expect(constituentName(person({ emails: ["rob@example.com"] }))).toBe("rob@example.com");
  });

  test("blank name strings are not a name", () => {
    expect(constituentName(person({ first_name: "  ", last_name: "", emails: ["a@b.org"] }))).toBe(
      "a@b.org"
    );
  });

  test("a real name always beats the email", () => {
    expect(
      constituentName(person({ first_name: "Rob", last_name: "Contreras", emails: ["rob@example.com"] }))
    ).toBe("Rob Contreras");
  });

  test("nameless person with no email keeps the placeholder", () => {
    expect(constituentName(person({ emails: [] }))).toBe("Unnamed person");
    expect(constituentName(person())).toBe("Unnamed person");
  });

  test("organization prefers org_name, then email, then placeholder", () => {
    const org = { type: "organization", first_name: null, last_name: null, org_name: null };
    expect(constituentName({ ...org, org_name: "Fast Forward" })).toBe("Fast Forward");
    expect(constituentName({ ...org, emails: ["give@ffwd.org"] })).toBe("give@ffwd.org");
    expect(constituentName(org)).toBe("Unnamed organization");
  });
});
