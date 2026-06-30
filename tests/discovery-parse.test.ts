import { describe, expect, test } from "vitest";
import { parseCandidates } from "@/lib/agents/prospect-discovery/agent";

// Offline eval for the prospect-discovery structured-output coercion: the safety
// net between a hallucinating model and the candidate list shown to fundraisers.

describe("parseCandidates", () => {
  test("drops rows with no name", () => {
    const out = parseCandidates({
      candidates: [
        { name: "  ", type: "foundation", fit_rationale: "x" },
        { name: "Acme Foundation", type: "foundation", fit_rationale: "good fit" },
      ],
    });
    expect(out.map((c) => c.name)).toEqual(["Acme Foundation"]);
  });

  test("forces an unknown type to 'individual' and truncates text", () => {
    const out = parseCandidates({
      candidates: [
        { name: "x".repeat(300), type: "alien", fit_rationale: "y".repeat(900), signal: "z".repeat(400) },
      ],
    });
    expect(out[0].type).toBe("individual");
    expect(out[0].name.length).toBe(200);
    expect(out[0].fit_rationale.length).toBe(600);
    expect(out[0].signal?.length).toBe(300);
  });

  test("keeps only string sources, capped at 6, and nulls blank org/signal", () => {
    const out = parseCandidates({
      candidates: [
        {
          name: "Donor",
          type: "corporate",
          org: "   ",
          sources: ["https://a", 42, "https://b", null, "https://c", "https://d", "https://e", "https://f", "https://g"],
        },
      ],
    });
    expect(out[0].org).toBeNull();
    expect(out[0].signal).toBeNull();
    expect(out[0].sources).toEqual(["https://a", "https://b", "https://c", "https://d", "https://e", "https://f"]);
  });

  test("returns [] for non-array or missing input", () => {
    expect(parseCandidates({ candidates: "nope" })).toEqual([]);
    expect(parseCandidates({})).toEqual([]);
    expect(parseCandidates(null)).toEqual([]);
  });
});
