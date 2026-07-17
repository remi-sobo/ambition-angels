import { describe, expect, test } from "vitest";
import {
  LEGACY_STAGES,
  loadPipelineConfig,
  stagesForPipeline,
  firstOpenStageKey,
  stageKeysOfType,
  stageKeyFromLabel,
  type PipelineConfig,
  type PipelineStage,
} from "@/lib/fundraising/stages";
import {
  OPEN_STAGE_KEYS,
  WON_STAGE_KEYS,
  LOST_STAGE_KEYS,
  ON_HOLD_STAGE_KEYS,
  isOpenStage,
  isTerminalStage,
} from "@/lib/fundraising/stage-sets";

// The ten-stage Sales taxonomy as seeded by fundraising_pipeline_config.sql.
const SALES_TEN: Array<[string, PipelineStage["stageType"]]> = [
  ["identified", "open"],
  ["researched", "open"],
  ["needs_appointment", "open"],
  ["appointment_scheduled", "open"],
  ["meeting_complete", "open"],
  ["ask_made", "open"],
  ["pledged", "open"],
  ["closed_won", "won"],
  ["closed_lost", "lost"],
  ["on_hold", "on_hold"],
];

const salesConfig = (): PipelineConfig => ({
  pipelines: [{ key: "default", label: "Sales Pipeline", sortOrder: 0, isDefault: true }],
  stages: SALES_TEN.map(([key, stageType], i) => ({
    pipeline: "default",
    key,
    label: key,
    sortOrder: i + 1,
    stageType,
    externalStageId: null,
    probabilityDefault: null,
    isActive: true,
  })),
  fromConfig: true,
});

describe("stage-sets: semantic unions cover both taxonomies", () => {
  test("every legacy stage lands in exactly one semantic set", () => {
    for (const s of LEGACY_STAGES) {
      const sets = [OPEN_STAGE_KEYS, WON_STAGE_KEYS, LOST_STAGE_KEYS, ON_HOLD_STAGE_KEYS];
      const hits = sets.filter((set) => (set as readonly string[]).includes(s.key)).length;
      expect(hits, `${s.key} should be in exactly one set`).toBe(1);
    }
  });

  test("every seeded Sales stage lands in the set matching its stage_type", () => {
    const byType = {
      open: OPEN_STAGE_KEYS,
      won: WON_STAGE_KEYS,
      lost: LOST_STAGE_KEYS,
      on_hold: ON_HOLD_STAGE_KEYS,
    } as const;
    for (const [key, type] of SALES_TEN) {
      expect(
        (byType[type] as readonly string[]).includes(key),
        `${key} should be in the ${type} set`
      ).toBe(true);
    }
  });

  test("on_hold is neither open nor terminal", () => {
    expect(isOpenStage("on_hold")).toBe(false);
    expect(isTerminalStage("on_hold")).toBe(false);
  });

  test("pledged is open, not won (decision D1)", () => {
    expect(isOpenStage("pledged")).toBe(true);
    expect(isTerminalStage("pledged")).toBe(false);
  });

  test("Angel Connectors stages land in the right sets", () => {
    // Committed is that pipeline's won; activation stages after it stay open.
    expect(isTerminalStage("committed")).toBe(true);
    for (const k of ["pitched", "big_3_idd", "linkedin_mined", "outreach_sent", "meetings_scheduled"]) {
      expect(isOpenStage(k), `${k} should be open`).toBe(true);
    }
  });
});

describe("stagesForPipeline", () => {
  test("returns config stages in sort order for a configured pipeline", () => {
    const stages = stagesForPipeline(salesConfig(), "default");
    expect(stages.map((s) => s.key)).toEqual(SALES_TEN.map(([k]) => k));
  });

  test("falls back to the legacy funnel for an unconfigured pipeline", () => {
    const stages = stagesForPipeline(salesConfig(), "727459407");
    expect(stages.map((s) => s.key)).toEqual([
      "identify", "qualify", "cultivate", "solicit", "steward", "lost",
    ]);
    expect(stages.every((s) => s.pipeline === "727459407")).toBe(true);
  });

  test("skips inactive stages", () => {
    const cfg = salesConfig();
    cfg.stages = cfg.stages.map((s) =>
      s.key === "researched" ? { ...s, isActive: false } : s
    );
    const keys = stagesForPipeline(cfg, "default").map((s) => s.key);
    expect(keys).not.toContain("researched");
    expect(keys).toHaveLength(9);
  });
});

describe("firstOpenStageKey", () => {
  test("picks the first open stage by sort order", () => {
    expect(firstOpenStageKey(stagesForPipeline(salesConfig(), "default"))).toBe("identified");
    expect(firstOpenStageKey(LEGACY_STAGES)).toBe("identify");
  });

  test("falls back to the first stage, then to 'identify'", () => {
    const wonOnly = stagesForPipeline(salesConfig(), "default").filter(
      (s) => s.stageType === "won"
    );
    expect(firstOpenStageKey(wonOnly)).toBe("closed_won");
    expect(firstOpenStageKey([])).toBe("identify");
  });
});

describe("stageKeysOfType", () => {
  test("buckets the Sales taxonomy by stage_type", () => {
    const stages = stagesForPipeline(salesConfig(), "default");
    expect(stageKeysOfType(stages, "won")).toEqual(["closed_won"]);
    expect(stageKeysOfType(stages, "lost")).toEqual(["closed_lost"]);
    expect(stageKeysOfType(stages, "on_hold")).toEqual(["on_hold"]);
    expect(stageKeysOfType(stages, "open")).toHaveLength(7);
  });
});

describe("stageKeyFromLabel", () => {
  test("slugifies labels into permanent keys", () => {
    expect(stageKeyFromLabel("Needs Appointment")).toBe("needs_appointment");
    expect(stageKeyFromLabel("Meeting Complete / Ready for Ask")).toBe(
      "meeting_complete_ready_for_ask"
    );
    expect(stageKeyFromLabel("  Big 3 ID'd!  ")).toBe("big_3_id_d");
  });

  test("never returns an empty key and caps length", () => {
    expect(stageKeyFromLabel("!!!")).toBe("stage");
    expect(stageKeyFromLabel("x".repeat(80)).length).toBeLessThanOrEqual(40);
  });
});

describe("loadPipelineConfig fallback", () => {
  // Minimal PostgREST-shaped stub: .from().select().order()[.eq()] awaits to
  // the canned result.
  const stubClient = (result: { data: unknown; error: unknown }) => {
    const thenable = {
      eq: () => thenable,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return {
      from: () => ({ select: () => ({ order: () => thenable }) }),
    } as never;
  };

  test("serves the legacy funnel when the config tables are missing", async () => {
    const cfg = await loadPipelineConfig(
      stubClient({ data: null, error: { message: "relation does not exist" } })
    );
    expect(cfg.fromConfig).toBe(false);
    expect(cfg.stages).toEqual(LEGACY_STAGES);
  });

  test("serves the legacy funnel when no rows are seeded", async () => {
    const cfg = await loadPipelineConfig(stubClient({ data: [], error: null }));
    expect(cfg.fromConfig).toBe(false);
    expect(firstOpenStageKey(stagesForPipeline(cfg, "default"))).toBe("identify");
  });
});
