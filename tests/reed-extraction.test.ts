import { beforeEach, describe, expect, test, vi } from "vitest";

// Identity shim for React's RSC-only cache (see tests/metrics.test.ts).
vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: (mod as { cache?: unknown }).cache ?? (<T,>(fn: T) => fn) };
});
vi.mock("@/lib/admin/statusLine", () => ({ getStatusLine: vi.fn() }));
vi.mock("@/lib/admin/outlookRead", () => ({ getOutlook: vi.fn() }));
vi.mock("@/lib/admin/actionQueue", () => ({ getActionQueue: vi.fn() }));
vi.mock("@/lib/admin/metrics/catalog", () => ({ getMetricCatalog: vi.fn() }));
vi.mock("@/lib/admin/profile", () => ({ getDisplayNames: vi.fn(async () => ({})) }));
vi.mock("@/lib/admin/permissions", () => ({ hasPermission: vi.fn(async () => true) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasPermission } from "@/lib/admin/permissions";
import { buildReedTools } from "@/lib/agents/reed/tools";
import {
  parseExtractionPayload,
  EXTRACTION_DOMAIN,
  EXTRACTION_KINDS,
} from "@/lib/agents/reed/extraction";

// Document extraction proposals (spec #6, Phase 4): the typed-payload rail.

const DOC_ID = "11111111-2222-3333-4444-555555555555";

describe("parseExtractionPayload (whitelist semantics)", () => {
  test("document_fields: valid fields pass, unknown keys are dropped", () => {
    const r = parseExtractionPayload({
      kind: "document_fields",
      document_id: DOC_ID,
      expires_at: "2027-06-30",
      doc_type: "award_letter",
      sneaky_extra: "rm -rf",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toEqual({
        kind: "document_fields",
        document_id: DOC_ID,
        expires_at: "2027-06-30",
        doc_type: "award_letter",
      });
      expect("sneaky_extra" in r.payload).toBe(false);
    }
  });

  test("document_fields: needs at least one field, a real date, a known doc_type", () => {
    expect(parseExtractionPayload({ kind: "document_fields", document_id: DOC_ID }).ok).toBe(false);
    expect(parseExtractionPayload({ kind: "document_fields", document_id: DOC_ID, expires_at: "soon" }).ok).toBe(false);
    expect(parseExtractionPayload({ kind: "document_fields", document_id: DOC_ID, doc_type: "not_a_type" }).ok).toBe(false);
  });

  test("obligation_task: title required, dates and category validated", () => {
    const r = parseExtractionPayload({
      kind: "obligation_task",
      document_id: DOC_ID,
      title: "Submit Sobrato interim report",
      due_date: "2026-09-30",
      category: "compliance",
    });
    expect(r.ok).toBe(true);
    expect(parseExtractionPayload({ kind: "obligation_task", document_id: DOC_ID, title: "  " }).ok).toBe(false);
    expect(parseExtractionPayload({ kind: "obligation_task", document_id: DOC_ID, title: "x", due_date: "next week" }).ok).toBe(false);
    expect(parseExtractionPayload({ kind: "obligation_task", document_id: DOC_ID, title: "x", category: "nonsense" }).ok).toBe(false);
  });

  test("unknown kinds are rejected — the payload-sprawl guard", () => {
    const r = parseExtractionPayload({ kind: "wire_transfer", document_id: DOC_ID, amount: 1e6 });
    expect(r.ok).toBe(false);
  });

  test("document_id must be a uuid", () => {
    expect(parseExtractionPayload({ kind: "document_fields", document_id: "../etc", expires_at: "2027-01-01" }).ok).toBe(false);
  });

  test("every kind has an accept domain (→ `${domain}.write`)", () => {
    for (const kind of EXTRACTION_KINDS) expect(EXTRACTION_DOMAIN[kind]).toBeTruthy();
    expect(EXTRACTION_DOMAIN.document_fields).toBe("documents");
    expect(EXTRACTION_DOMAIN.obligation_task).toBe("ops");
  });
});

describe("propose_document_extraction tool", () => {
  // Session stub: documents row lookup + reed_suggestions insert capture.
  let inserted: Record<string, unknown> | null;
  let docRow: Record<string, unknown> | null;

  const sb = {
    from: (table: string) => {
      if (table === "documents") {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: docRow }) };
        return chain;
      }
      if (table === "reed_suggestions") {
        return {
          insert: (row: Record<string, unknown>) => {
            inserted = row;
            return { select: () => ({ single: async () => ({ data: { id: "sug-1" }, error: null }) }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;

  const tool = () => {
    const t = buildReedTools(sb, "org-1", "remi@test").find((x) => x.name === "propose_document_extraction");
    if (!t) throw new Error("tool not registered");
    return t;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasPermission).mockResolvedValue(true);
    inserted = null;
    docRow = { id: DOC_ID, title: "Sobrato award letter", filename: "sobrato.pdf" };
  });

  test("writes an inert suggestion row with the validated payload", async () => {
    const out = (await tool().run({
      document_id: DOC_ID,
      kind: "obligation_task",
      payload: { title: "Submit interim report", due_date: "2026-09-30", junk: "dropped" },
      rationale: "Page 2: 'an interim report is due September 30, 2026'.",
    })) as Record<string, unknown>;
    expect(out.proposed).toBe(true);
    expect(inserted!.status).toBe("suggested");
    expect(inserted!.domain).toBe("ops");
    expect(inserted!.target_type).toBe("document");
    expect(inserted!.target_id).toBe(DOC_ID);
    const payload = inserted!.payload as Record<string, unknown>;
    expect(payload.kind).toBe("obligation_task");
    expect(payload.junk).toBeUndefined();
  });

  test("document_fields rides the documents domain and needs documents.write", async () => {
    vi.mocked(hasPermission).mockImplementation(async (_sb, _org, perm) => perm !== "documents.write");
    const out = (await tool().run({
      document_id: DOC_ID,
      kind: "document_fields",
      payload: { expires_at: "2027-06-30" },
      rationale: "Cover page: grant period ends June 30, 2027.",
    })) as { error?: string };
    expect(out.error).toBe("permission_denied");
    expect(inserted).toBeNull();
  });

  test("an invalid payload never reaches the table", async () => {
    const out = (await tool().run({
      document_id: DOC_ID,
      kind: "document_fields",
      payload: { expires_at: "whenever" },
      rationale: "…",
    })) as { error?: string };
    expect(out.error).toBe("bad_request");
    expect(inserted).toBeNull();
  });

  test("a document the user can't see → not_found, nothing written", async () => {
    docRow = null;
    const out = (await tool().run({
      document_id: DOC_ID,
      kind: "document_fields",
      payload: { expires_at: "2027-06-30" },
      rationale: "…",
    })) as { error?: string };
    expect(out.error).toBe("not_found");
    expect(inserted).toBeNull();
  });
});
