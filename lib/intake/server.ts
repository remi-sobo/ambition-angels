import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { INTAKE_HANDLERS } from "./handlers";
import type { IntakeDeps } from "./pipeline";
import type { IntakeOrg } from "./types";

/**
 * The real collaborators for the intake pipeline: service-role reads and
 * writes against org_api_keys, orgs, org_entitlements and intake_submissions.
 *
 * Service role is right here and only here: there is no user session, the
 * key is the credential, and every query is scoped to the org the key
 * resolved to. Entitlements are read for that org only.
 */

const UNIQUE_VIOLATION = "23505";
const STALE_CLAIM_MS = 5 * 60 * 1000;

export function intakeDeps(): IntakeDeps {
  const db = getSupabaseAdmin();
  return {
    handlers: INTAKE_HANDLERS,
    ctxFor: (org) => ({ org, db }),

    async findKeyByHash(hash) {
      const { data, error } = await db
        .from("org_api_keys")
        .select("id, org_id, scopes, revoked_at")
        .eq("key_hash", hash)
        .maybeSingle();
      if (error) throw new Error(`org_api_keys read: ${error.message}`);
      return data ? { ...data, scopes: (data.scopes ?? []) as string[] } : null;
    },

    async touchKey(id) {
      await db.from("org_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", id);
    },

    async loadOrg(orgId) {
      const { data } = await db.from("orgs").select("id, slug, name, settings").eq("id", orgId).maybeSingle();
      return data ? ({ ...data, settings: (data.settings ?? {}) as Record<string, unknown> } as IntakeOrg) : null;
    },

    async loadEntitlements(orgId) {
      const { data, error } = await db
        .from("org_entitlements")
        .select("feature_key")
        .eq("org_id", orgId)
        .eq("enabled", true);
      if (error) throw new Error(`org_entitlements read: ${error.message}`);
      return new Set((data ?? []).map((r) => r.feature_key as string));
    },

    async claim({ orgId, keyId, kind, submissionId }) {
      const { error } = await db
        .from("intake_submissions")
        .insert({ org_id: orgId, api_key_id: keyId, kind, submission_id: submissionId });
      if (!error) return { claimed: true };
      if (error.code !== UNIQUE_VIOLATION) throw new Error(`intake_submissions claim: ${error.message}`);
      // A claim left "processing" past the stale window means the call that
      // made it died mid-run (and its insert, if any, failed with it). Take
      // the claim over so a retry can finish. The status + age filter keeps
      // two concurrent retries from both winning.
      const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
      const { data: takeover } = await db
        .from("intake_submissions")
        .update({ created_at: new Date().toISOString(), api_key_id: keyId })
        .eq("org_id", orgId)
        .eq("submission_id", submissionId)
        .eq("status", "processing")
        .lt("created_at", staleBefore)
        .select("id");
      if (takeover && takeover.length > 0) return { claimed: true };
      const { data } = await db
        .from("intake_submissions")
        .select("status, response")
        .eq("org_id", orgId)
        .eq("submission_id", submissionId)
        .maybeSingle();
      return {
        claimed: false,
        status: data?.status === "done" ? "done" : "processing",
        response: (data?.response ?? null) as Record<string, unknown> | null,
      };
    },

    async complete({ orgId, submissionId, response }) {
      const { error } = await db
        .from("intake_submissions")
        .update({ status: "done", response, completed_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("submission_id", submissionId);
      if (error) throw new Error(error.message);
    },

    async release({ orgId, submissionId }) {
      await db
        .from("intake_submissions")
        .delete()
        .eq("org_id", orgId)
        .eq("submission_id", submissionId)
        .eq("status", "processing");
    },
  };
}
