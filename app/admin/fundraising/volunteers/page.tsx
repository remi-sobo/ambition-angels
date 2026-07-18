import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { getTermLabel, pluralizeTerm } from "@/lib/admin/terminology";
import PageHeader from "../../_components/PageHeader";
import { NewVolunteerForm, UnflagButton } from "./_components/VolunteerControls";

// Volunteer (Leader) list — constituents flagged is_volunteer, relabeled per
// org_terminology (YL EPA reads "Leaders"). Volunteers are constituents
// wearing a different hat (spine entity registry), so rows link to the
// standard constituent profile; this page exists because the donors list is
// gift-gated and could never surface a volunteer who has not given.
export const dynamic = "force-dynamic";

type VolunteerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  emails: string[];
  phones: string[];
  created_at: string;
};

const displayName = (v: VolunteerRow) =>
  [v.first_name, v.last_name].filter(Boolean).join(" ") || v.org_name || "(no name)";

export default async function VolunteersPage() {
  const ctx = await getOrgContext();
  const term = await getTermLabel("volunteer", "Volunteer");
  const terms = pluralizeTerm(term);

  const supabase = getSupabaseAdmin();
  const { data } = ctx
    ? await supabase
        .from("constituents")
        .select("id, first_name, last_name, org_name, emails, phones, created_at")
        .eq("org_id", ctx.orgId)
        .eq("is_volunteer", true)
        .is("archived_at", null)
        .order("last_name", { ascending: true, nullsFirst: false })
        .limit(500)
    : { data: [] };
  const volunteers = (data ?? []) as VolunteerRow[];

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[900px]">
      <PageHeader
        title={terms}
        subtitle={`${volunteers.length} on the roster · records live in fundraising`}
        actions={<NewVolunteerForm term={term} />}
      />

      <div className="space-y-2">
        {volunteers.map((v) => (
          <article
            key={v.id}
            className="bg-surface shadow-panel border-[1.5px] border-outline rounded-card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1"
          >
            <Link
              href={`/admin/fundraising/donors/${v.id}`}
              className="font-semibold text-ink-1 hover:text-orange transition-colors"
            >
              {displayName(v)}
            </Link>
            <span className="text-xs text-ink-2">{v.emails?.[0] ?? ""}</span>
            <span className="text-xs text-ink-2">{v.phones?.[0] ?? ""}</span>
            <span className="ml-auto">
              <UnflagButton id={v.id} name={displayName(v)} term={term} />
            </span>
          </article>
        ))}
        {volunteers.length === 0 && (
          <p className="text-sm text-ink-2">
            No {terms.toLowerCase()} yet — add one above. {terms} are people
            records in fundraising, so touches and notes work like any contact.
          </p>
        )}
      </div>
    </div>
  );
}
