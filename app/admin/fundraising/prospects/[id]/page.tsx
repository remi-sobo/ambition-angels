import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import ScoreEditor, { type ProspectScore } from "./_components/ScoreEditor";
import CompanyCard, { type HsCompany } from "./_components/CompanyCard";
import DealsTable, { type HsDeal } from "./_components/DealsTable";
import EngagementTimeline, { type HsEngagement } from "./_components/EngagementTimeline";
import BriefPanel, { type ExistingBrief } from "./_components/BriefPanel";

// Prospect detail — keyed by the bench entity (fr_prospects.id), so it works for
// HubSpot-sourced, manually-added, and AI-discovered prospects alike. HubSpot
// enrichment (company, deals, engagements, raw) renders only when the prospect
// is linked to a mirror contact. Scoring + research key off prospect_id.

type Prospect = {
  id: string;
  hubspot_contact_id: string | null;
  type: string;
  source: string;
  status: string;
  name: string;
  email: string | null;
  org_name: string | null;
  strategy_note: string | null;
};

type HsContact = {
  hubspot_id: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  lifecycle_stage: string | null;
  lead_status: string | null;
  owner_id: string | null;
  last_activity_at: string | null;
  raw_json: unknown;
};

const SOURCE_LABEL: Record<string, string> = { hubspot: "HubSpot", manual: "Added by hand", research: "AI discovery" };
const TYPE_LABEL: Record<string, string> = { individual: "Individual", foundation: "Foundation", corporate: "Corporate", unknown: "Unknown" };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-2">{label}</div>
      <div className="mt-0.5 text-sm text-ink-1">{children}</div>
    </div>
  );
}

export default async function ProspectDetailPage({ params }: { params: { id: string } }) {
  const prospectId = params.id;
  const supabase = createServerSupabase();

  const { data: prospectRow } = await supabase
    .from("fr_prospects")
    .select("id, hubspot_contact_id, type, source, status, name, email, org_name, strategy_note")
    .eq("id", prospectId)
    .maybeSingle();
  const prospect = prospectRow as Prospect | null;
  if (!prospect) notFound();

  const hubspotId = prospect.hubspot_contact_id;

  // Score + brief key off the bench entity.
  const [scoreRes, briefRes] = await Promise.all([
    supabase.from("fr_prospect_scores").select("*").eq("prospect_id", prospectId).maybeSingle(),
    supabase
      .from("fr_prospect_briefs")
      .select("id, content, template_version, status, generated_at, created_by")
      .eq("prospect_id", prospectId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const score = (scoreRes.data as ProspectScore | null) ?? null;
  const brief = (briefRes.data as ExistingBrief | null) ?? null;

  // HubSpot enrichment — only when this prospect is linked to a mirror contact.
  let contact: HsContact | null = null;
  let company: HsCompany | null = null;
  let deals: HsDeal[] = [];
  let engagements: HsEngagement[] = [];
  if (hubspotId) {
    const [contactRes, dealsRes, engagementsRes] = await Promise.all([
      supabase
        .from("hs_contacts")
        .select("hubspot_id, email, phone, company, lifecycle_stage, lead_status, owner_id, last_activity_at, raw_json")
        .eq("hubspot_id", hubspotId)
        .maybeSingle(),
      supabase
        .from("hs_deals")
        .select("hubspot_id, name, amount, stage, pipeline, close_date, last_activity_at")
        .eq("primary_contact_id", hubspotId)
        .order("last_activity_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("hs_engagements")
        .select("hubspot_id, engagement_type, subject, body_preview, occurred_at")
        .contains("contact_ids", [hubspotId])
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .limit(50),
    ]);
    contact = (contactRes.data as HsContact | null) ?? null;
    deals = (dealsRes.data as HsDeal[] | null) ?? [];
    engagements = (engagementsRes.data as HsEngagement[] | null) ?? [];
    const companyName = prospect.org_name ?? contact?.company ?? null;
    if (companyName) {
      const { data: companyData } = await supabase
        .from("hs_companies")
        .select("hubspot_id, name, domain, industry, owner_id, last_activity_at")
        .ilike("name", companyName)
        .maybeSingle();
      company = (companyData as HsCompany | null) ?? null;
    }
  }

  const email = prospect.email ?? contact?.email ?? null;
  const org = prospect.org_name ?? contact?.company ?? null;
  const portalId = process.env.HUBSPOT_PORTAL_ID;
  const hubspotUrl = hubspotId && portalId ? `https://app.hubspot.com/contacts/${portalId}/contact/${hubspotId}` : null;

  return (
    <div className="max-w-5xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <Link href="/admin/fundraising/prospects" className="inline-block text-xs text-ink-2 hover:text-ink-1 transition-colors">
        ← Back to Prospects
      </Link>

      <header className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display font-black uppercase tracking-tight text-ink-1 text-3xl sm:text-4xl leading-none">
              {prospect.name}
            </h1>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-2">
              <span className="uppercase tracking-wide border border-outline rounded px-1.5 py-0.5">{TYPE_LABEL[prospect.type] ?? prospect.type}</span>
              <span>· {SOURCE_LABEL[prospect.source] ?? prospect.source}</span>
              {prospect.status !== "active" && <span className="text-orange">· {prospect.status}</span>}
            </div>
          </div>
          {hubspotUrl && (
            <a
              href={hubspotUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs font-semibold text-orange hover:text-orange-dark bg-orange/10 hover:bg-orange/15 border border-orange/30 px-3 py-2 rounded-lg whitespace-nowrap"
            >
              View in HubSpot ↗
            </a>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <MetaItem label="Email">
            {email ? <a href={`mailto:${email}`} className="text-orange hover:underline break-all">{email}</a> : <span className="text-ink-2">—</span>}
          </MetaItem>
          <MetaItem label="Phone">{contact?.phone ?? <span className="text-ink-2">—</span>}</MetaItem>
          <MetaItem label="Organization">{org ?? <span className="text-ink-2">—</span>}</MetaItem>
          <MetaItem label="Lifecycle">{contact?.lifecycle_stage ?? <span className="text-ink-2">—</span>}</MetaItem>
          <MetaItem label="Last Activity">{fmtDate(contact?.last_activity_at ?? null)}</MetaItem>
        </div>

        {prospect.strategy_note && (
          <div className="mt-4 border-t border-hairline pt-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-2">Why / angle</div>
            <p className="mt-0.5 text-sm text-ink-1">{prospect.strategy_note}</p>
          </div>
        )}
      </header>

      <BriefPanel prospectId={prospect.id} brief={brief} />

      <ScoreEditor prospectId={prospect.id} initial={score} />

      {hubspotId && (
        <>
          <CompanyCard company={company} rawCompanyName={org} />
          <DealsTable deals={deals} />
          <EngagementTimeline engagements={engagements} />
          {contact && (
            <details className="rounded-card border-[1.5px] border-outline bg-surface p-6 group">
              <summary className="cursor-pointer text-xs uppercase tracking-wider text-ink-2 hover:text-ink-1 select-none">
                Raw HubSpot data
              </summary>
              <pre className="mt-4 text-[11px] text-ink-2 font-mono leading-relaxed bg-surface border border-hairline rounded-lg p-4 overflow-x-auto">
                {JSON.stringify(contact.raw_json, null, 2)}
              </pre>
            </details>
          )}
        </>
      )}
    </div>
  );
}
