import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ackDraftTool,
  buildAckDraftPrompt,
  cleanNudge,
  parseAckDraft,
  resolveVoice,
} from "@/lib/agents/ack-draft/prompt";
import type { AckContext } from "@/lib/admin/ackContext";

// specs/needs-you-popout-thank-yous.md, PR 4: the AI thank-you draft. The
// prompt is built only from server-loaded facts; voice is per-org data; the
// route is gated, fenced, and logs ids and tokens only.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const ctx = (over: Partial<AckContext> = {}): AckContext => ({
  giftId: "g1",
  status: "pending",
  amount: 250,
  giftDate: "2026-07-12",
  dueDate: "2026-07-14",
  sourceLabel: "Entered in BloomOS",
  notes: "Follow-on after the gala.",
  campaign: null,
  fund: null,
  appeal: null,
  receiptRequired: true,
  donor: { id: "c1", name: "Erica Fitzgerald", firstName: "Erica", isOrganization: false, email: "erica@example.org", doNotContact: false, whyMatters: null },
  history: { ordinal: 2, lifetimeCount: 2, lifetimeTotal: 350, previous: { date: "2026-03-01", amount: 100 } },
  recommendation: { channel: "email", channelLabel: "Email", basis: "default", ruleName: null, major: false, escalationOwner: null },
  ...over,
});

describe("resolveVoice", () => {
  test("an org with no voice drafts in its own name, neutral", () => {
    expect(resolveVoice({}, "Young, Gifted & Black")).toEqual({
      signerName: "Young, Gifted & Black",
      signerTitle: null,
      toneNotes: null,
      styleRules: null,
      missionLine: null,
    });
    expect(resolveVoice(null, "X").signerName).toBe("X");
  });
  test("reads orgs.settings.ack_voice and trims it", () => {
    const v = resolveVoice(
      { email_domain: "x.org", ack_voice: { signer_name: " Remi Sobomehin ", signer_title: "Founder and CEO", style_rules: "No em dashes.", tone_notes: "", mission_line: 42 } },
      "Ambition Angels",
    );
    expect(v).toEqual({ signerName: "Remi Sobomehin", signerTitle: "Founder and CEO", toneNotes: null, styleRules: "No em dashes.", missionLine: null });
  });
});

describe("buildAckDraftPrompt", () => {
  const ygb = resolveVoice({}, "Young, Gifted & Black");

  test("Erica: the gala note is a fact the model sees", () => {
    const { prompt } = buildAckDraftPrompt({ ctx: ctx(), orgName: "Young, Gifted & Black", voice: ygb, kind: "email", nudge: null });
    expect(prompt).toContain("Note on this gift: Follow-on after the gala.");
    expect(prompt).toContain("Donor: Erica Fitzgerald (person), first name Erica");
    expect(prompt).toContain("Gift: $250 on 2026-07-12");
    expect(prompt).toContain("gift number 2 of 2, previous gift on 2026-03-01");
    expect(prompt).toContain("under 150 words");
  });

  test("another tenant's prompt never names Ambition Angels", () => {
    const { system, prompt } = buildAckDraftPrompt({ ctx: ctx(), orgName: "Young, Gifted & Black", voice: ygb, kind: "email", nudge: null });
    expect(system + prompt).not.toMatch(/Ambition Angels/);
    expect(prompt).toContain("Signer: Young, Gifted & Black");
  });

  test("hard rules: facts only, no invented numbers, no tax language", () => {
    const { system } = buildAckDraftPrompt({ ctx: ctx(), orgName: "O", voice: ygb, kind: "email", nudge: null });
    expect(system).toMatch(/Use only the facts given/);
    expect(system).toMatch(/Mention a number only if it appears in the facts/);
    expect(system).toMatch(/No tax, receipt, or deductibility language/);
  });

  test("a major gift's talking points, an organization donor, first gift", () => {
    const { prompt } = buildAckDraftPrompt({
      ctx: ctx({
        amount: 20000,
        notes: null,
        donor: { id: "c2", name: "Fast Forward", firstName: null, isOrganization: true, email: null, doNotContact: false, whyMatters: null },
        history: { ordinal: 1, lifetimeCount: 1, lifetimeTotal: 20000, previous: null },
      }),
      orgName: "O",
      voice: ygb,
      kind: "talking_points",
      nudge: null,
    });
    expect(prompt).toContain("Donor: Fast Forward (organization)");
    expect(prompt).not.toContain("first name");
    expect(prompt).toContain("this is their first gift");
    expect(prompt).toContain("3 to 5 short talking points");
    expect(prompt).not.toContain("Note on this gift");
  });

  test("the nudge is labeled a preference, bounded, and optional", () => {
    const { prompt } = buildAckDraftPrompt({ ctx: ctx(), orgName: "O", voice: ygb, kind: "email", nudge: cleanNudge("  warmer, mention the gala  ") });
    expect(prompt).toContain("Adjustment from the staff member (a preference, not a fact): warmer, mention the gala");
    expect(cleanNudge("x".repeat(500))?.length).toBe(200);
    expect(cleanNudge("   ")).toBeNull();
    expect(cleanNudge(7)).toBeNull();
  });
});

describe("tool schema and parsing", () => {
  test("schemas", () => {
    expect(ackDraftTool("email").input_schema.required).toEqual(["subject", "body"]);
    expect(ackDraftTool("talking_points").input_schema.required).toEqual(["points", "subject", "body"]);
  });
  test("parseAckDraft", () => {
    expect(parseAckDraft({ subject: " Thank you ", body: "Dear Erica," }, "email")).toEqual({ subject: "Thank you", body: "Dear Erica,", points: null });
    expect(parseAckDraft({ subject: "S", body: "B", points: ["a", " ", 3, "b"] }, "talking_points")).toEqual({ subject: "S", body: "B", points: ["a", "b"] });
    expect(parseAckDraft({ subject: "S", body: "B", points: [] }, "talking_points")).toBeNull();
    expect(parseAckDraft({ subject: "", body: "B" }, "email")).toBeNull();
    expect(parseAckDraft(null, "email")).toBeNull();
  });
});

describe("the draft route", () => {
  const src = read("app", "api", "admin", "acknowledgments", "draft", "route.ts");
  const popout = src.slice(src.indexOf("async function draftForPopout"));
  test("gated on ai.ack_draft, fundraising.write, the AI cap, and do-not-contact", () => {
    expect(popout).toMatch(/requireEntitlement\("ai\.ack_draft"\)/);
    expect(popout).toMatch(/hasPermission\(supabase, orgId, "fundraising\.write"\)/);
    expect(popout).toMatch(/orgOverAICap\(supabase, orgId\)/);
    expect(popout).toMatch(/doNotContact\) \{\s+return NextResponse\.json\([^)]*\{ status: 409 \}/);
  });
  test("facts come from the org-fenced loader, never the request body", () => {
    expect(popout).toMatch(/loadAckContext\(supabase, orgId, giftId\)/);
    expect(read("lib", "admin", "ackContextLoad.ts").match(/\.eq\("org_id", orgId\)/g)?.length).toBeGreaterThanOrEqual(4);
  });
  test("the composer's legacy path is fenced to the active org too", () => {
    expect(src).toMatch(/\.eq\("id", giftId\)\s*\/\/[^\n]*\n[^\n]*\n\s*\.eq\("org_id", ctx\.orgId\)/);
  });
  test("logs ids, kind, latency and tokens; never names or draft text", () => {
    const log = popout.slice(popout.indexOf("logAICall("), popout.indexOf("});", popout.indexOf("logAICall(")));
    expect(log).toMatch(/metadata: \{ gift_id: giftId, kind, latency_ms/);
    expect(log).not.toMatch(/subject|body|donor|name|prompt/);
    const err = popout.slice(popout.indexOf("console.error("), popout.indexOf(");", popout.indexOf("console.error(")));
    expect(err).not.toMatch(/prompt|draft\.|body|name/);
  });
  test("a 20-second timeout and the house voice sweep", () => {
    expect(src).toMatch(/DRAFT_TIMEOUT_MS = 20_000/);
    expect(popout).toMatch(/cleanVoiceText\(draft\.body\)/);
  });
});

describe("ack_draft_seed.sql", () => {
  const sql = read("supabase", "migrations", "ack_draft_seed.sql");
  const body = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").toLowerCase();
  test("data only: no DDL", () => {
    expect(body).not.toMatch(/\b(create|alter|drop)\s+(table|view|function|policy|index|trigger)/);
  });
  test("ai.ack_draft for AA and YGB, AA's voice merged into settings", () => {
    expect(body).toMatch(/'ai\.ack_draft', true, 'seed:ack_draft'/);
    expect(body).toMatch(/where o\.slug in \('ambition-angels', 'young-gifted-black'\)/);
    expect(body).toMatch(/coalesce\(settings, '\{\}'::jsonb\) \|\| jsonb_build_object\(\s+'ack_voice'/);
    expect(sql).toMatch(/'style_rules', 'No em dashes\./);
  });
  test("the harness applies it", () => {
    expect(read("scripts", "test-rls.sh")).toMatch(/ack_draft_seed\.sql/);
  });
});
