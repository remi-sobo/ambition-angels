import type { SupabaseClient } from "@supabase/supabase-js";
import type { SetupReader, SetupWriter, ExistingOrg } from "../lib/admin/onboarding/planner";
import { inviteMemberWith } from "../lib/admin/people-invite";

/**
 * The concrete SetupReader/SetupWriter for scripts/setup-org.ts: a
 * service-role client on the operator's machine. Every read and write names
 * the org explicitly (the service role bypasses RLS). Writes are
 * insert-if-missing or upserts on the tables' natural keys, so a re-run is a
 * no-op. Never imported by the app. It lives in scripts/ on purpose:
 * org_entitlements writes are operator-only, and
 * tests/role-guard-coverage.test.ts forbids them anywhere under app/ or lib/.
 */

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export function supabaseSetupReader(sb: SupabaseClient): SetupReader {
  return {
    async findOrgBySlug(slug) {
      const { data, error } = await sb.from("orgs").select("id, name, settings").eq("slug", slug).maybeSingle();
      fail("read orgs", error);
      return (data as ExistingOrg | null) ?? null;
    },
    async entitlements(orgId) {
      const { data, error } = await sb.from("org_entitlements").select("feature_key").eq("org_id", orgId).eq("enabled", true);
      fail("read org_entitlements", error);
      return (data ?? []).map((r) => r.feature_key as string);
    },
    async terminology(orgId) {
      const { data, error } = await sb.from("org_terminology").select("term_key, label").eq("org_id", orgId);
      fail("read org_terminology", error);
      return Object.fromEntries((data ?? []).map((r) => [r.term_key as string, r.label as string]));
    },
    async participantStageKeys(orgId) {
      const { data, error } = await sb.from("participant_stages").select("stage_key").eq("org_id", orgId);
      fail("read participant_stages", error);
      return (data ?? []).map((r) => r.stage_key as string);
    },
    async pipelineKeys(orgId) {
      const { data, error } = await sb.from("pipelines").select("key").eq("org_id", orgId);
      fail("read pipelines", error);
      return (data ?? []).map((r) => r.key as string);
    },
    async pipelineStageKeys(orgId, pipeline) {
      const { data, error } = await sb.from("pipeline_stages").select("key").eq("org_id", orgId).eq("pipeline", pipeline);
      fail("read pipeline_stages", error);
      return (data ?? []).map((r) => r.key as string);
    },
    async financeCategoryCount(orgId) {
      const { count, error } = await sb.from("fin_categories").select("id", { count: "exact", head: true }).eq("org_id", orgId);
      fail("count fin_categories", error);
      return count ?? 0;
    },
    async fiscalYearStartMonth(orgId) {
      const { data, error } = await sb.from("fin_config").select("fiscal_year_start_month").eq("org_id", orgId).maybeSingle();
      fail("read fin_config", error);
      return (data?.fiscal_year_start_month as number | undefined) ?? null;
    },
    async hasDefaultGiftTemplate(orgId) {
      const { count, error } = await sb
        .from("ack_templates")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("subject_type", "gift")
        .eq("channel", "email")
        .eq("is_default", true);
      fail("read ack_templates", error);
      return (count ?? 0) > 0;
    },
    async ownerMembership(orgId, email) {
      // Page the auth users for this one email (the admin API has no lookup).
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
        fail("list auth users", error);
        const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
        if (hit) {
          const { data: m } = await sb.from("memberships").select("role").eq("org_id", orgId).eq("user_id", hit.id).maybeSingle();
          if (!m) return "none";
          return m.role === "owner" ? "owner" : "other-role";
        }
        if (data.users.length < 1000) break;
      }
      return "none";
    },
  };
}

export function supabaseSetupWriter(sb: SupabaseClient, redirectTo: string): SetupWriter {
  return {
    async createOrg(row) {
      const { data, error } = await sb.from("orgs").insert(row).select("id").single();
      fail("create org", error);
      return data!.id as string;
    },
    async updateOrg(orgId, row) {
      const { error } = await sb.from("orgs").update(row).eq("id", orgId);
      fail("update org", error);
    },
    async enableEntitlements(orgId, keys, source) {
      if (!keys.length) return;
      const { error } = await sb
        .from("org_entitlements")
        .upsert(keys.map((feature_key) => ({ org_id: orgId, feature_key, enabled: true, source })), { onConflict: "org_id,feature_key" });
      fail("enable entitlements", error);
    },
    async upsertTerminology(orgId, rows) {
      if (!rows.length) return;
      const { error } = await sb.from("org_terminology").upsert(rows.map((r) => ({ org_id: orgId, ...r })), { onConflict: "org_id,term_key" });
      fail("set terminology", error);
    },
    async insertParticipantStages(orgId, rows) {
      const { error } = await sb
        .from("participant_stages")
        .upsert(rows.map((r) => ({ org_id: orgId, ...r })), { onConflict: "org_id,stage_key", ignoreDuplicates: true });
      fail("add participant stages", error);
    },
    async insertPipeline(orgId, row) {
      const { error } = await sb
        .from("pipelines")
        .upsert({ org_id: orgId, sort_order: 0, ...row }, { onConflict: "org_id,key", ignoreDuplicates: true });
      fail("add pipeline", error);
    },
    async insertPipelineStages(orgId, rows) {
      const { error } = await sb
        .from("pipeline_stages")
        .upsert(rows.map((r) => ({ org_id: orgId, ...r })), { onConflict: "org_id,pipeline,key", ignoreDuplicates: true });
      fail("add pipeline stages", error);
    },
    async seedFinanceCategories(orgId) {
      const { data, error } = await sb.rpc("fin_seed_starter_categories", { p_org: orgId });
      fail("seed finance categories", error);
      return Number(data ?? 0);
    },
    async setFiscalYearStart(orgId, month) {
      const { data, error } = await sb.from("fin_config").update({ fiscal_year_start_month: month }).eq("org_id", orgId).select("org_id");
      fail("update fin_config", error);
      if (!data || data.length === 0) {
        const ins = await sb.from("fin_config").insert({ org_id: orgId, fiscal_year_start_month: month });
        fail("create fin_config", ins.error);
      }
    },
    async insertThankYouTemplate(orgId, row) {
      const { error } = await sb.from("ack_templates").insert({
        org_id: orgId, subject_type: "gift", channel: "email", is_default: true, ...row,
      });
      fail("add thank-you template", error);
    },
    async inviteOwner(orgId, email) {
      const r = await inviteMemberWith({ admin: sb, db: sb }, orgId, email, "owner", redirectTo, { allowExistingMember: true });
      if (!r.ok) throw new Error(`invite owner: ${r.error}`);
      return { emailed: r.emailed, existing: !r.emailed };
    },
  };
}
