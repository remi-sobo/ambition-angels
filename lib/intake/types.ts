import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeatureKey } from "@/lib/admin/entitlements";

/**
 * Website intake API v1 (specs/bloomos-repo-split.md §6a).
 *
 * A tenant-generic BloomOS feature: an org connects its public website forms
 * with an API key. The key resolves the org. A payload never names its org.
 */

export const INTAKE_SCOPES = ["intake:forms", "intake:donations"] as const;
export type IntakeScope = (typeof INTAKE_SCOPES)[number];

/** The org a key resolved to. Loaded once per call, service role. */
export type IntakeOrg = {
  id: string;
  slug: string;
  name: string;
  settings: Record<string, unknown>;
};

export type IntakeCtx = {
  org: IntakeOrg;
  /** Service-role client. Every write stamps org_id = ctx.org.id. */
  db: SupabaseClient;
};

export type Validated<T> = { ok: true; data: T } | { ok: false; error: string };

/** What a handler returns to the website. Stored verbatim for idempotent replays. */
export type IntakeResult = Record<string, unknown>;

export type KindHandler<T> = {
  /** Scope the key must carry. */
  scope: IntakeScope;
  /** Entitlement the key's org must hold (AA-only kinds carry an aa.* key). */
  entitlement?: FeatureKey;
  /** Same rules as the public route had. The website validates too. */
  validate(body: Record<string, unknown>): Validated<T>;
  /** Insert into the org's tenant and send the operator notification. Throws on a failed write. */
  run(ctx: IntakeCtx, data: T): Promise<IntakeResult>;
};
