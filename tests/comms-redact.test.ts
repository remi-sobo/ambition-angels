import { describe, expect, test } from "vitest";

import {
  leaksAnyName,
  mayNameToModel,
  namesToHunt,
  placeholderFor,
  redactNames,
  redactStoryForModel,
  type RedactableSubject,
} from "../lib/comms/redact";
import type { ConsentRow } from "../lib/comms/consent";

/**
 * The module's whole compliance claim in one file: individually identifiable
 * participant data never reaches a model.
 *
 * These tests are written to try to get a name through, not to confirm the
 * happy path.
 */

const TODAY = "2026-08-19";

const consent = (scope: string[], over: Partial<ConsentRow> = {}): ConsentRow => ({
  scope,
  requested_at: null,
  granted_at: "2026-08-01",
  expires_at: null,
  revoked_at: null,
  ...over,
});

const minor = (over: Partial<RedactableSubject> = {}): RedactableSubject => ({
  id: "s1",
  subject_type: "participant",
  display_label: "Marcus",
  is_minor: true,
  consents: [consent(["first_name", "photo"])],
  ...over,
});

describe("mayNameToModel — the gate", () => {
  test("a minor is never nameable, whatever the consent says", () => {
    expect(mayNameToModel(minor({ consents: [consent(["full_name"])] }), TODAY)).toBe(false);
  });

  test("an adult with full_name consent is nameable", () => {
    expect(
      mayNameToModel(minor({ is_minor: false, consents: [consent(["full_name"])] }), TODAY),
    ).toBe(true);
  });

  test("first_name consent is NOT permission to hand a name to a model", () => {
    // A first-name grant governs what may be PUBLISHED. The model boundary is
    // separate and stricter, on purpose.
    expect(
      mayNameToModel(minor({ is_minor: false, consents: [consent(["first_name"])] }), TODAY),
    ).toBe(false);
  });

  test("expired or revoked full_name consent stops being permission", () => {
    const expired = minor({
      is_minor: false,
      consents: [consent(["full_name"], { expires_at: "2026-01-01" })],
    });
    expect(mayNameToModel(expired, TODAY)).toBe(false);
    const revoked = minor({
      is_minor: false,
      consents: [consent(["full_name"], { revoked_at: "2026-08-10T00:00:00Z" })],
    });
    expect(mayNameToModel(revoked, TODAY)).toBe(false);
  });

  test("no consent at all is not permission", () => {
    expect(mayNameToModel(minor({ is_minor: false, consents: [] }), TODAY)).toBe(false);
  });
});

describe("placeholderFor", () => {
  test("a minor reads as a young person regardless of type", () => {
    expect(placeholderFor(minor())).toBe("a young person");
  });

  test("each subject type gets prose the model can write around", () => {
    expect(placeholderFor(minor({ is_minor: false, subject_type: "participant" }))).toBe("a participant");
    expect(placeholderFor(minor({ is_minor: false, subject_type: "partner" }))).toBe("a partner organization");
    expect(placeholderFor(minor({ is_minor: false, subject_type: "constituent" }))).toBe("a supporter");
    expect(placeholderFor(minor({ is_minor: false, subject_type: "staff" }))).toBe("a team member");
  });
});

describe("namesToHunt", () => {
  test("includes the label, the known names, and each part of them", () => {
    const names = namesToHunt(minor({ display_label: "Marcus", knownNames: ["Marcus Chen"] }));
    expect(names).toContain("Marcus Chen");
    expect(names).toContain("Marcus");
    expect(names).toContain("Chen");
  });

  test("longest first, so a full name is replaced before its parts", () => {
    const names = namesToHunt(minor({ knownNames: ["Marcus Chen"] }));
    expect(names[0]).toBe("Marcus Chen");
  });

  test("single characters are dropped — a lone initial identifies nobody and matches everything", () => {
    expect(namesToHunt(minor({ display_label: "J", knownNames: ["J Smith"] }))).not.toContain("J");
  });

  test("punctuation around a name part is stripped", () => {
    expect(namesToHunt(minor({ knownNames: ["Marcus, Jr."] }))).toContain("Marcus");
  });
});

describe("redactNames — trying to get a name through", () => {
  const subs = [minor({ knownNames: ["Marcus Chen"] })];

  test("the plain case", () => {
    const { text } = redactNames("Marcus landed the internship.", subs, TODAY);
    expect(text).toBe("a young person landed the internship.");
  });

  test("lowercase does not sneak through", () => {
    const { text } = redactNames("we are proud of marcus today", subs, TODAY);
    expect(text).not.toMatch(/marcus/i);
  });

  test("SHOUTING does not sneak through", () => {
    expect(redactNames("MARCUS DID IT", subs, TODAY).text).not.toMatch(/marcus/i);
  });

  test("a surname mentioned alone later in the paragraph is caught", () => {
    const { text } = redactNames("Marcus Chen interviewed. Chen got the offer.", subs, TODAY);
    expect(text).not.toMatch(/chen/i);
    expect(text).not.toMatch(/marcus/i);
  });

  test("the full name is replaced as a unit, leaving no orphan surname", () => {
    const { text } = redactNames("Marcus Chen interviewed.", subs, TODAY);
    expect(text).toBe("a young person interviewed.");
  });

  test("possessives survive readably and still redact", () => {
    const { text } = redactNames("Marcus's essay was strong.", subs, TODAY);
    expect(text).toContain("a young person's essay");
    expect(text).not.toMatch(/marcus/i);
  });

  test("a name inside a longer word is NOT replaced — no mangling", () => {
    const { text } = redactNames("The Marcuson Foundation gave a grant.", subs, TODAY);
    expect(text).toContain("Marcuson Foundation");
  });

  test("hyphenated and apostrophe names are word-bounded correctly", () => {
    const s = [minor({ display_label: "Anne-Marie", knownNames: ["O'Brien"] })];
    const { text } = redactNames("Anne-Marie and O'Brien both spoke.", s, TODAY);
    expect(text).not.toMatch(/anne-marie/i);
    expect(text).not.toMatch(/o'brien/i);
  });

  test("a nameable adult is left alone", () => {
    const adult = [
      minor({ is_minor: false, display_label: "Dana Wu", consents: [consent(["full_name"])] }),
    ];
    expect(redactNames("Dana Wu chaired the gala.", adult, TODAY).text).toBe(
      "Dana Wu chaired the gala.",
    );
  });

  test("mixed subjects: the minor is redacted, the consented adult is not", () => {
    const both = [
      minor({ id: "a", display_label: "Marcus" }),
      minor({ id: "b", is_minor: false, display_label: "Dana", consents: [consent(["full_name"])] }),
    ];
    const { text } = redactNames("Dana mentored Marcus all summer.", both, TODAY);
    expect(text).toBe("Dana mentored a young person all summer.");
  });

  test("every replacement is reported, with counts, for the audit record", () => {
    const { replacements } = redactNames("Marcus met Marcus's mentor.", subs, TODAY);
    const marcus = replacements.find((r) => r.from === "Marcus");
    expect(marcus?.count).toBe(2);
    expect(marcus?.to).toBe("a young person");
  });

  test("over-redaction is the accepted failure: a name that is also a word goes anyway", () => {
    // A participant called Grace means "grace" gets replaced in prose too. A
    // human reads every draft; the opposite error is not recoverable.
    const grace = [minor({ display_label: "Grace" })];
    const { text } = redactNames("She handled it with grace.", grace, TODAY);
    expect(text).toBe("She handled it with a young person.");
  });

  test("regex metacharacters in a name don't blow up or silently skip", () => {
    const weird = [minor({ display_label: "A.J." , knownNames: ["A.J. (Tony)"] })];
    const { text } = redactNames("A.J. showed up early.", weird, TODAY);
    expect(text).not.toContain("A.J.");
  });

  test("empty and missing text is handled", () => {
    expect(redactNames("", subs, TODAY).text).toBe("");
  });
});

describe("redactStoryForModel", () => {
  const story = {
    id: "story-1",
    title: "Marcus landed the internship",
    body: "After eight weeks, Marcus Chen interviewed at a local firm.",
    outcome: "Chen starts in September.",
  };
  const subs = [minor({ knownNames: ["Marcus Chen"] })];
  const metrics = [
    {
      snapshot_id: "snap-1",
      metric_id: "m1",
      name: "Teens served",
      value: 47,
      unit: "teens",
      captured_on: "2026-08-01",
    },
  ];

  test("no field escapes redaction — title, body, and outcome are all scrubbed", () => {
    const { redacted } = redactStoryForModel(story, subs, metrics, TODAY);
    const all = [redacted.title, redacted.body, redacted.outcome].join(" ");
    expect(all).not.toMatch(/marcus/i);
    expect(all).not.toMatch(/chen/i);
  });

  test("the grounding records exactly what went out", () => {
    const { grounding } = redactStoryForModel(story, subs, metrics, TODAY);
    expect(grounding.story_id).toBe("story-1");
    expect(grounding.fields).toEqual(["title", "body", "outcome"]);
    expect(grounding.metric_snapshot_ids).toEqual(["snap-1"]);
    expect(grounding.media_excluded).toBe(true);
    expect(grounding.subjects).toEqual([
      { id: "s1", type: "participant", redacted: true, is_minor: true },
    ]);
  });

  test("the grounding contains no participant name — it is stored, so it must be clean too", () => {
    const { grounding } = redactStoryForModel(story, subs, metrics, TODAY);
    // The `redactions` list names what was REMOVED, which is by design and is
    // the audit trail. Everything else must be free of it.
    const withoutRedactionList = JSON.stringify({ ...grounding, redactions: [] });
    expect(withoutRedactionList).not.toMatch(/marcus/i);
    expect(withoutRedactionList).not.toMatch(/chen/i);
  });

  test("duplicate replacements are merged with a total count", () => {
    const { grounding } = redactStoryForModel(story, subs, [], TODAY);
    const chen = grounding.redactions.filter((r) => r.from === "Chen");
    expect(chen).toHaveLength(1);
  });

  test("subject descriptions tell the model how it may refer to someone", () => {
    const { redacted } = redactStoryForModel(story, subs, [], TODAY);
    expect(redacted.subjectDescriptions[0]).toContain("a young person");
    expect(redacted.subjectDescriptions[0]).toContain("never invent a name");
  });

  test("a story with no body or outcome reports only the fields it sent", () => {
    const bare = { id: "s", title: "A win", body: null, outcome: null };
    const { grounding } = redactStoryForModel(bare, [], [], TODAY);
    expect(grounding.fields).toEqual(["title"]);
  });

  test("metrics are passed as resolved values, never as a query capability", () => {
    const { redacted } = redactStoryForModel(story, subs, metrics, TODAY);
    expect(redacted.metrics[0]).toMatchObject({ name: "Teens served", value: 47 });
  });
});

describe("leaksAnyName — the last-line assertion", () => {
  const subs = [minor({ knownNames: ["Marcus Chen"] })];

  test("clean text passes", () => {
    expect(leaksAnyName("a young person landed the internship", subs, TODAY)).toBeNull();
  });

  test("a leaked first name is caught and named", () => {
    expect(leaksAnyName("Marcus landed it", subs, TODAY)).toBe("Marcus");
  });

  test("a leaked surname is caught", () => {
    expect(leaksAnyName("Chen landed it", subs, TODAY)).toBe("Chen");
  });

  test("case does not help anything slip past", () => {
    expect(leaksAnyName("mArCuS landed it", subs, TODAY)).toBe("Marcus");
  });

  test("a consented adult's name is not treated as a leak", () => {
    const adult = [
      minor({ is_minor: false, display_label: "Dana", consents: [consent(["full_name"])] }),
    ];
    expect(leaksAnyName("Dana chaired the gala", adult, TODAY)).toBeNull();
  });

  test("redactStoryForModel output always passes its own assertion", () => {
    const story = {
      id: "s",
      title: "Marcus Chen and marcus and CHEN",
      body: "Marcus's mentor said Chen was ready.",
      outcome: null,
    };
    const { redacted } = redactStoryForModel(story, subs, [], TODAY);
    expect(leaksAnyName(`${redacted.title} ${redacted.body}`, subs, TODAY)).toBeNull();
  });
});
