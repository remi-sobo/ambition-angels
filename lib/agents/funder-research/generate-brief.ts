/**
 * Orchestration for a single research-brief generation:
 *   1. Load prospect context from the HubSpot mirror (contact, company,
 *      deals, recent engagements, internal connections).
 *   2. Infer prospect_type from the contact's email / company.
 *   3. Call runFunderResearch() with the assembled context.
 *
 * The caller (the API route) handles auth, rate-limiting, budget caps,
 * persistence to fr_prospect_briefs, and activity logging.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runFunderResearch } from "./client";
import type {
  ContextCompany,
  ContextContact,
  ContextDeal,
  ContextEngagement,
  InternalConnection,
  ProspectType,
  ResearchContext,
  ResearchResult,
} from "./types";

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "live.com",
  "msn.com",
  "proton.me",
  "protonmail.com",
]);

const FOUNDATION_KEYWORDS = [
  "foundation",
  "fund",
  "trust",
  "philanthropies",
  "philanthropy",
  "endowment",
  "charitable",
];

/**
 * Best-effort guess at what kind of prospect this is. Wrong is fine — the
 * agent can correct itself from web search. We're just biasing its
 * starting framing.
 */
export function inferProspectType(
  contact: ContextContact,
  company: ContextCompany | null
): ProspectType {
  const c = (contact.company ?? "").toLowerCase();
  const email = (contact.email ?? "").toLowerCase();
  const emailDomain = email.includes("@") ? email.split("@")[1] : "";
  const companyName = (company?.name ?? "").toLowerCase();

  // Foundations: explicit keywords in company name OR a .org email domain
  // (rough heuristic, weak but cheap signal).
  if (
    FOUNDATION_KEYWORDS.some((k) => c.includes(k) || companyName.includes(k)) ||
    emailDomain.endsWith(".org")
  ) {
    return "foundation";
  }

  // Individuals: personal email domain.
  if (emailDomain && PERSONAL_EMAIL_DOMAINS.has(emailDomain)) {
    return "individual";
  }

  // Corporate: has a company AND a non-personal email domain.
  if (c && emailDomain) {
    return "corporate";
  }

  return "unknown";
}

/**
 * Find people in our HubSpot mirror connected to this prospect — same
 * company, or recent engagements that mention the company by name. Capped
 * at 25 total to keep the agent input bounded. Wrong is OK; agent treats
 * connections as candidates, not facts.
 */
export async function loadInternalConnections(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  contact: ContextContact,
  orgId: string
): Promise<InternalConnection[]> {
  const company = (contact.company ?? "").trim();
  if (!company) return [];

  const seen = new Set<string>([contact.hubspot_id]);
  const out: InternalConnection[] = [];

  // (1) Contacts whose company text matches (case-insensitive, no wildcards
  // in user input — sanitize defensively).
  const safeCompany = company.replace(/[,()*%]/g, "");
  if (safeCompany.length > 0) {
    const { data: sameCompany } = await supabase
      .from("hs_contacts")
      .select("hubspot_id, first_name, last_name, email, company")
      .eq("org_id", orgId)
      .ilike("company", safeCompany)
      .limit(50);
    for (const r of (sameCompany ?? []) as Array<{
      hubspot_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      company: string | null;
    }>) {
      if (seen.has(r.hubspot_id)) continue;
      seen.add(r.hubspot_id);
      const name =
        [r.first_name, r.last_name].filter(Boolean).join(" ") ||
        r.email ||
        "(unnamed)";
      out.push({
        name,
        email: r.email,
        company: r.company,
        relationship_note: "Same company in our HubSpot mirror",
      });
      if (out.length >= 25) return out;
    }
  }

  // (2) Engagements that mention the company name in subject or body.
  const pattern = `%${safeCompany}%`;
  if (safeCompany.length > 0) {
    const { data: hits } = await supabase
      .from("hs_engagements")
      .select(
        "hubspot_id, engagement_type, subject, body_preview, occurred_at, contact_ids"
      )
      .eq("org_id", orgId)
      .or(`subject.ilike.${pattern},body_preview.ilike.${pattern}`)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(100);

    const referencedContactIds = new Set<string>();
    const noteByContactId = new Map<string, string>();
    for (const e of (hits ?? []) as Array<{
      engagement_type: string | null;
      occurred_at: string | null;
      contact_ids: string[] | null;
    }>) {
      const day = (e.occurred_at ?? "").slice(0, 10) || "unknown date";
      const note = `Mentioned in ${e.engagement_type ?? "engagement"} on ${day}`;
      for (const cid of e.contact_ids ?? []) {
        if (seen.has(cid)) continue;
        // First mention wins for the note — newest engagements come first.
        if (!noteByContactId.has(cid)) {
          noteByContactId.set(cid, note);
          referencedContactIds.add(cid);
        }
      }
    }

    if (referencedContactIds.size > 0) {
      const { data: extraContacts } = await supabase
        .from("hs_contacts")
        .select("hubspot_id, first_name, last_name, email, company")
        .eq("org_id", orgId)
        .in("hubspot_id", Array.from(referencedContactIds));
      for (const r of (extraContacts ?? []) as Array<{
        hubspot_id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        company: string | null;
      }>) {
        if (seen.has(r.hubspot_id)) continue;
        seen.add(r.hubspot_id);
        const name =
          [r.first_name, r.last_name].filter(Boolean).join(" ") ||
          r.email ||
          "(unnamed)";
        out.push({
          name,
          email: r.email,
          company: r.company,
          relationship_note: noteByContactId.get(r.hubspot_id) ?? "Engagement mentions this prospect's org",
        });
        if (out.length >= 25) return out;
      }
    }
  }

  return out;
}

// ── Top-level orchestration ───────────────────────────────────────────────

/**
 * Loads everything we know about this contact from the HubSpot mirror and
 * invokes the agent. Throws on contact-not-found so the caller returns 404.
 * Re-throws any underlying Anthropic / parse errors so the caller logs the
 * failure with the right status.
 *
 * Org fence: this runs on the service-role client (bypasses RLS) and often in
 * a background task (no session), so every mirror read carries the caller's
 * orgId explicitly and the agent prompt is built for that org.
 */
export async function generateBriefForContact(
  hubspotContactId: string,
  orgId: string
): Promise<{ context: ResearchContext; result: ResearchResult }> {
  const supabase = getSupabaseAdmin();

  const { data: contactRow, error: contactErr } = await supabase
    .from("hs_contacts")
    .select(
      "hubspot_id, email, first_name, last_name, phone, company, lifecycle_stage, lead_status, owner_id, last_activity_at, created_in_hubspot_at"
    )
    .eq("org_id", orgId)
    .eq("hubspot_id", hubspotContactId)
    .maybeSingle();
  if (contactErr) {
    throw new Error(`Failed to load contact: ${contactErr.message}`);
  }
  if (!contactRow) {
    const e = new Error("Contact not found in hs_contacts");
    (e as Error & { code?: string }).code = "CONTACT_NOT_FOUND";
    throw e;
  }
  const contact = contactRow as ContextContact;

  // Company (best-effort name match — same approach as PR 6's detail page).
  let company: ContextCompany | null = null;
  if (contact.company) {
    const { data: companyRow } = await supabase
      .from("hs_companies")
      .select("hubspot_id, name, domain, industry, owner_id, last_activity_at")
      .eq("org_id", orgId)
      .ilike("name", contact.company)
      .maybeSingle();
    company = (companyRow as ContextCompany | null) ?? null;
  }

  // Deals + recent engagements (parallel).
  const [dealsRes, engagementsRes, internalConnections] = await Promise.all([
    supabase
      .from("hs_deals")
      .select(
        "hubspot_id, name, amount, stage, pipeline, close_date, last_activity_at"
      )
      .eq("org_id", orgId)
      .eq("primary_contact_id", hubspotContactId)
      .order("last_activity_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("hs_engagements")
      .select(
        "hubspot_id, engagement_type, subject, body_preview, occurred_at"
      )
      .eq("org_id", orgId)
      .contains("contact_ids", [hubspotContactId])
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(25),
    loadInternalConnections(supabase, contact, orgId),
  ]);

  const deals = (dealsRes.data as ContextDeal[] | null) ?? [];
  const recentEngagements =
    (engagementsRes.data as ContextEngagement[] | null) ?? [];

  const prospectType = inferProspectType(contact, company);

  const context: ResearchContext = {
    hubspot_contact_id: hubspotContactId,
    contact,
    company,
    deals,
    recent_engagements: recentEngagements,
    internal_connections: internalConnections,
    prospect_type: prospectType,
  };

  const result = await runFunderResearch(context, orgId);
  return { context, result };
}

/**
 * Brief generation keyed off a bench prospect. HubSpot-linked prospects reuse
 * the full mirror context; manual / AI-discovered prospects get a minimal
 * synthesized context (the agent web-searches from the name + org regardless).
 */
export async function generateBriefForProspect(
  prospect: {
    id: string;
    hubspot_contact_id: string | null;
    name: string;
    email: string | null;
    org_name: string | null;
    type: string;
  },
  orgId: string
): Promise<{ context: ResearchContext; result: ResearchResult }> {
  if (prospect.hubspot_contact_id) {
    return generateBriefForContact(prospect.hubspot_contact_id, orgId);
  }

  // No HubSpot record — synthesize a thin context from the bench row.
  const parts = prospect.name.trim().split(/\s+/);
  const contact: ContextContact = {
    hubspot_id: prospect.id,
    email: prospect.email,
    first_name: parts[0] ?? prospect.name,
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
    phone: null,
    company: prospect.org_name,
    lifecycle_stage: null,
    lead_status: null,
    owner_id: null,
    last_activity_at: null,
    created_in_hubspot_at: null,
  };
  const prospectType: ProspectType =
    prospect.type === "foundation" || prospect.type === "corporate" || prospect.type === "individual"
      ? prospect.type
      : inferProspectType(contact, null);

  const context: ResearchContext = {
    hubspot_contact_id: prospect.id,
    contact,
    company: null,
    deals: [],
    recent_engagements: [],
    internal_connections: [],
    prospect_type: prospectType,
  };
  const result = await runFunderResearch(context, orgId);
  return { context, result };
}
