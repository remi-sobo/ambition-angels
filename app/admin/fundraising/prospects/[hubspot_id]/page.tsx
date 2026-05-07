import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import ScorePanel, { type ProspectScore } from "./_components/ScorePanel";
import CompanyCard, { type HsCompany } from "./_components/CompanyCard";
import DealsTable, { type HsDeal } from "./_components/DealsTable";
import EngagementTimeline, {
  type HsEngagement,
} from "./_components/EngagementTimeline";

// ── Types local to this page ───────────────────────────────────────────────

type HsContact = {
  hubspot_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  lifecycle_stage: string | null;
  lead_status: string | null;
  owner_id: string | null;
  last_activity_at: string | null;
  created_in_hubspot_at: string | null;
  raw_json: unknown;
};

// ── Display helpers ────────────────────────────────────────────────────────

function displayName(c: HsContact): string {
  const parts = [c.first_name, c.last_name].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  if (parts.length > 0) return parts.join(" ");
  return c.email ?? "Unknown contact";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function MetaItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-mid">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-cream/85">{children}</div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

type PageProps = { params: { hubspot_id: string } };

export default async function ProspectDetailPage({ params }: PageProps) {
  const hubspotId = params.hubspot_id;
  const supabase = getSupabaseAdmin();

  // Four queries that key off the URL param — no inter-dependency, all
  // fan out in parallel. Company is fetched in a second step because it
  // joins on the contact's denormalized company name string.
  const [contactRes, scoreRes, dealsRes, engagementsRes] = await Promise.all([
    supabase
      .from("hs_contacts")
      .select(
        "hubspot_id, email, first_name, last_name, phone, company, lifecycle_stage, lead_status, owner_id, last_activity_at, created_in_hubspot_at, raw_json"
      )
      .eq("hubspot_id", hubspotId)
      .maybeSingle(),
    supabase
      .from("fr_prospect_scores")
      .select("*")
      .eq("hubspot_contact_id", hubspotId)
      .maybeSingle(),
    supabase
      .from("hs_deals")
      .select(
        "hubspot_id, name, amount, stage, pipeline, close_date, last_activity_at"
      )
      .eq("primary_contact_id", hubspotId)
      .order("last_activity_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("hs_engagements")
      .select(
        "hubspot_id, engagement_type, subject, body_preview, occurred_at"
      )
      .contains("contact_ids", [hubspotId])
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(50),
  ]);

  const contact = contactRes.data as HsContact | null;
  if (!contact) {
    notFound();
  }

  // Company: best-effort match on the contact's denormalized company name.
  // HubSpot doesn't expose a clean FK from contact → company at the property
  // level, so this is approximate. PR 8+ may add a deal-association based
  // lookup; for now, name match is what we have.
  let company: HsCompany | null = null;
  if (contact.company) {
    const { data: companyData } = await supabase
      .from("hs_companies")
      .select("hubspot_id, name, domain, industry, owner_id, last_activity_at")
      .ilike("name", contact.company)
      .maybeSingle();
    company = (companyData as HsCompany | null) ?? null;
  }

  const score = (scoreRes.data as ProspectScore | null) ?? null;
  const deals = (dealsRes.data as HsDeal[] | null) ?? [];
  const engagements = (engagementsRes.data as HsEngagement[] | null) ?? [];

  // HubSpot deep-link: built from HUBSPOT_PORTAL_ID. Hidden if the env var
  // isn't set, so we don't render a broken /contacts/undefined/contact/… URL.
  const portalId = process.env.HUBSPOT_PORTAL_ID;
  const hubspotUrl = portalId
    ? `https://app.hubspot.com/contacts/${portalId}/contact/${hubspotId}`
    : null;

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="rounded-card border border-white/10 bg-black/30 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display font-black uppercase tracking-tight text-cream text-3xl sm:text-4xl leading-none">
              {displayName(contact)}
            </h1>
            <div className="mt-1 text-xs text-gray-mid font-mono">
              HubSpot ID {contact.hubspot_id}
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

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetaItem label="Email">
            {contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="text-orange hover:underline break-all"
              >
                {contact.email}
              </a>
            ) : (
              <span className="text-gray-mid">—</span>
            )}
          </MetaItem>
          <MetaItem label="Phone">
            {contact.phone ?? <span className="text-gray-mid">—</span>}
          </MetaItem>
          <MetaItem label="Company">
            {contact.company ?? <span className="text-gray-mid">—</span>}
          </MetaItem>
          <MetaItem label="Lifecycle Stage">
            {contact.lifecycle_stage ?? (
              <span className="text-gray-mid">—</span>
            )}
          </MetaItem>
          <MetaItem label="Owner ID">
            <span className="font-mono text-xs">
              {contact.owner_id ?? "—"}
            </span>
          </MetaItem>
          <MetaItem label="Last Activity">
            {fmtDate(contact.last_activity_at)}
          </MetaItem>
        </div>
      </header>

      {/* ── Score panel ────────────────────────────────────────────────── */}
      <ScorePanel score={score} />

      {/* ── Company ────────────────────────────────────────────────────── */}
      <CompanyCard company={company} rawCompanyName={contact.company} />

      {/* ── Deals ──────────────────────────────────────────────────────── */}
      <DealsTable deals={deals} />

      {/* ── Engagement timeline ────────────────────────────────────────── */}
      <EngagementTimeline engagements={engagements} />

      {/* ── Raw HubSpot data (collapsed) ───────────────────────────────── */}
      <details className="rounded-card border border-white/10 bg-black/30 p-6 group">
        <summary className="cursor-pointer text-xs uppercase tracking-wider text-gray-mid hover:text-cream select-none">
          Raw HubSpot data
        </summary>
        <pre className="mt-4 text-[11px] text-cream/70 font-mono leading-relaxed bg-black/40 border border-white/5 rounded-lg p-4 overflow-x-auto">
          {JSON.stringify(contact.raw_json, null, 2)}
        </pre>
      </details>
    </div>
  );
}
