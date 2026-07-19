import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import StatCard from "../../_components/StatCard";
import { KIND_LABELS, type Partner } from "../_lib/partners";
import { STATUS_LABELS, STATUS_STYLE, NEXT_STATUS, STATUS_SHORT, type PartnerStatus } from "../_lib/status";
import {
  EditPartnerButton, AddContactForm, ContactCard, LogPartnerInteraction, MouControls,
  type ContactT,
} from "./_components/PartnerProfileControls";
import { AdvanceStage } from "./_components/AdvanceStage";
import { RubricEditor } from "./_components/RubricEditor";
import { MergeControl } from "./_components/MergeControl";
import { type ScoreFactors } from "../_lib/rubric";
import { EntityTasks } from "../../_components/EntityTasks";
import { EntityDocuments } from "../../_components/EntityDocuments";
import { RailEntity } from "../../_components/rail/RailEntityContext";
import { TYPE } from "@/lib/admin/typeScale";

// Partner org profile + contacts directory + activity timeline (Ring 3).
export const dynamic = "force-dynamic";

const fmtWhen = (s: string) =>
  new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

const INT_LABEL: Record<string, string> = {
  call: "Call", email: "Email", meeting: "Meeting", event: "Event", note: "Note",
};

export default async function PartnerProfilePage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const supabase = getSupabaseAdmin();
  // Org fence: the service-role client bypasses RLS. Scope the partner read to
  // the caller's org (foreign id → not-found, was an IDOR) and every child read
  // + the merge-candidate picker.
  const ctx = await getOrgContext();
  if (!ctx) notFound();
  const orgId = ctx.orgId;

  const [pRes, contactsRes, intsRes, candRes] = await Promise.all([
    supabase.from("partners").select("*").eq("org_id", orgId).eq("id", params.id).maybeSingle(),
    supabase
      .from("partner_contacts")
      .select("id, first_name, last_name, email, phone, title, tags, notes, is_primary")
      .eq("org_id", orgId)
      .eq("partner_id", params.id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("partner_interactions")
      .select("id, kind, occurred_at, notes, logged_by, contact_id")
      .eq("org_id", orgId)
      .eq("partner_id", params.id)
      .order("occurred_at", { ascending: false })
      .limit(200),
    // Candidate orgs for the "merge a duplicate in" picker.
    supabase.from("partners").select("id, name, kind, city, status").eq("org_id", orgId).order("name").limit(500),
  ]);

  if (!pRes.data) notFound();
  const p = pRes.data as Partner;
  const contacts = (contactsRes.data ?? []) as ContactT[];
  const interactions = (intsRes.data ?? []) as Array<{
    id: string; kind: string; occurred_at: string; notes: string | null;
    logged_by: string | null; contact_id: string | null;
  }>;
  const candidates = (candRes.data ?? []) as Array<{
    id: string; name: string; kind: string; city: string | null; status: string;
  }>;

  const contactName = (id: string | null) => {
    const c = contacts.find((x) => x.id === id);
    return c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : null;
  };

  const today = new Date().toISOString().slice(0, 10);
  const mouExpired = p.mou_status === "signed" && !!p.mou_end && p.mou_end < today;
  const next = NEXT_STATUS[p.status as PartnerStatus];
  const geo = [p.city, p.region].filter(Boolean).join(", ");
  const websiteHref = p.domain
    ? p.domain.startsWith("http") ? p.domain : `https://${p.domain}`
    : null;

  return (
    <div className="min-h-screen bg-ink">
      <div className="bg-tile border-b border-outline px-4 lg:px-8 py-3 sm:py-4 sticky admin-sticky-top z-30 flex items-center gap-3 flex-wrap">
        <Link href="/admin/partners" className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors">
          ← Partners
        </Link>
        <span className={`${TYPE.cardTitle} sm:text-base truncate`}>{p.name}</span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[p.status]}`}>
          {STATUS_LABELS[p.status] ?? p.status}
        </span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-tile text-ink-2 uppercase tracking-wider">
          {KIND_LABELS[p.kind] ?? p.kind}
        </span>
        {next && <AdvanceStage partnerId={p.id} next={next} label={`Move to ${STATUS_SHORT[next]}`} />}
      </div>

      <div className="max-w-[1100px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Stage" value={STATUS_SHORT[p.status] ?? p.status} sub={geo || undefined} />
          <StatCard label="Contacts" value={contacts.length} sub={contacts.length === 0 ? "add the first" : undefined} />
          <StatCard
            label="Last touch"
            value={p.last_touch_at ? fmtWhen(p.last_touch_at) : "—"}
            sub={`${interactions.length} logged`}
          />
          <StatCard
            label="MOU"
            value={p.mou_status === "none" ? "—" : p.mou_status}
            sub={p.mou_end ? `${mouExpired ? "expired" : "ends"} ${p.mou_end}` : undefined}
            muted={p.mou_status === "none"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Profile */}
          <section className="lg:col-span-4 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 space-y-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h2 className={TYPE.cardTitle}>Profile</h2>
              <EditPartnerButton partner={{
                id: p.id, name: p.name, kind: p.kind, status: p.status,
                city: p.city, region: p.region, domain: p.domain,
                priority_score: p.priority_score, notes: p.notes,
              }} />
            </div>
            {[
              ["Type", KIND_LABELS[p.kind] ?? p.kind],
              ["Area", geo || "—"],
              ["Website", websiteHref ? "link" : "—"],
              ["Source", p.external_source ?? "manual"],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3 text-xs">
                <span className="text-ink-3 w-20 flex-shrink-0 uppercase tracking-wider font-semibold pt-px">{label}</span>
                {label === "Website" && websiteHref ? (
                  <a href={websiteHref} target="_blank" rel="noreferrer" className="text-orange/80 hover:text-orange break-all">{p.domain}</a>
                ) : (
                  <span className="text-ink-1 break-words min-w-0">{String(value)}</span>
                )}
              </div>
            ))}
            {p.notes && <p className="text-xs text-ink-2 border-t border-outline pt-3 whitespace-pre-wrap">{p.notes}</p>}

            <div className="border-t border-outline pt-3">
              <RubricEditor
                partnerId={p.id}
                initial={(p.score_factors as ScoreFactors | null) ?? null}
              />
            </div>

            <div className="border-t border-outline pt-3">
              <h3 className={`${TYPE.sectionHeader} mb-2`}>Agreements</h3>
              <MouControls partner={{
                id: p.id, mou_status: p.mou_status, mou_end: p.mou_end,
                data_agreement_signed: p.data_agreement_signed,
              }} />
            </div>

            <div className="border-t border-outline pt-3">
              <MergeControl keepId={p.id} keepName={p.name} candidates={candidates} />
            </div>
          </section>

          {/* Contacts + Activity */}
          <div className="lg:col-span-8 space-y-4">
            <RailEntity type="partner" id={p.id} label={p.name} />
            <EntityTasks entityType="partner" entityId={p.id} entityLabel={p.name} defaultCategory="program" />
            <EntityDocuments entityType="partner" entityId={p.id} entityLabel={p.name} />

            <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className={TYPE.cardTitle}>
                  Contacts {contacts.length > 0 && <span className="text-ink-3 font-normal">· {contacts.length}</span>}
                </h2>
                <AddContactForm partnerId={p.id} />
              </div>
              {contacts.length === 0 ? (
                <p className="text-sm text-ink-2">No contacts yet — add the people you work with at this org.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {contacts.map((c) => <ContactCard key={c.id} contact={c} />)}
                </div>
              )}
            </section>

            <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-outline flex items-center justify-between gap-3 flex-wrap">
                <h2 className={TYPE.cardTitle}>Activity</h2>
                <LogPartnerInteraction
                  partnerId={p.id}
                  contacts={contacts.map((c) => ({
                    id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Contact",
                  }))}
                />
              </div>
              {interactions.length === 0 ? (
                <p className={`p-6 ${TYPE.bodyMuted}`}>No touches logged yet. Calls, emails, and meetings appear here.</p>
              ) : (
                <ul className="divide-y divide-hairline">
                  {interactions.map((i) => (
                    <li key={i.id} className="px-5 py-3 text-sm flex items-start gap-4">
                      <span className="text-xs text-ink-2 w-24 flex-shrink-0 pt-px">{fmtWhen(i.occurred_at)}</span>
                      <span className="text-[10px] uppercase tracking-wider text-orange font-semibold w-16 flex-shrink-0 pt-1">
                        {INT_LABEL[i.kind] ?? i.kind}
                      </span>
                      <div className="min-w-0 flex-1">
                        {i.contact_id && contactName(i.contact_id) && (
                          <div className="text-xs text-ink-3">with {contactName(i.contact_id)}</div>
                        )}
                        {i.notes && <p className={`${TYPE.body} mt-0.5 whitespace-pre-wrap`}>{i.notes}</p>}
                        {i.logged_by && <div className="text-[10px] text-ink-3 mt-0.5">logged by {i.logged_by}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
