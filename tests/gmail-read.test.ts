import { describe, expect, test } from "vitest";
import {
  parseAddresses,
  isStaffEmail,
  counterpartyEmails,
  type ParsedMessage,
} from "../lib/google/gmail-read";

const msg = (over: Partial<ParsedMessage>): ParsedMessage => ({
  messageId: "m",
  threadId: "t",
  internalDate: 0,
  direction: "inbound",
  subject: null,
  from: null,
  to: [],
  snippet: "",
  ...over,
});

describe("parseAddresses", () => {
  test("extracts, lowercases, and dedupes", () => {
    expect(parseAddresses("Jane Doe <Jane@X.org>, bob@y.org, jane@x.org")).toEqual([
      "jane@x.org",
      "bob@y.org",
    ]);
  });
  test("null / garbage → []", () => {
    expect(parseAddresses(null)).toEqual([]);
    expect(parseAddresses("no addresses here")).toEqual([]);
  });
});

describe("isStaffEmail", () => {
  test("staff domain is staff", () => {
    expect(isStaffEmail("remi@ambitionangels.org")).toBe(true);
  });
  test("external and null are not", () => {
    expect(isStaffEmail("officer@foundation.org")).toBe(false);
    expect(isStaffEmail(null)).toBe(false);
  });
});

describe("counterpartyEmails", () => {
  test("staff-sent → the external recipient", () => {
    expect(
      counterpartyEmails(msg({ from: "remi@ambitionangels.org", to: ["donor@foundation.org"] }))
    ).toEqual(["donor@foundation.org"]);
  });
  test("inbound from external → the external sender", () => {
    expect(
      counterpartyEmails(msg({ from: "donor@foundation.org", to: ["remi@ambitionangels.org"] }))
    ).toEqual(["donor@foundation.org"]);
  });
  test("staff-to-staff → none (not logged)", () => {
    expect(
      counterpartyEmails(
        msg({ from: "remi@ambitionangels.org", to: ["shannon@ambitionangels.org"] })
      )
    ).toEqual([]);
  });
});
