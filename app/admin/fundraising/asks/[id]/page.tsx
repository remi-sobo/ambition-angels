import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { constituentName } from "@/lib/fundraising/display";
import { ASK_FORM_LABELS } from "@/lib/fundraising/asks";
import PageHeader from "../../../_components/PageHeader";
import {
  AskStatusSelect,
  EditableAskDetails,
  AskDocuments,
  DeleteAskButton,
  type AskDocument,
} from "../_components/AskControls";
import { TYPE } from "@/lib/admin/typeScale";

// Ask detail: the facts, the status control, the linked grant/opportunity, and
// the document store (proposal PDF, cover letter, budget).
export const dynamic = "force-dynamic";

type AskRow = {
  id: string;
  form: string;
  title: string | null;
  status: string;
  amount_requested: number | null;
  amount_committed: number | null;
  ask_date: string | null;
  decided_on: string | null;
  owner: string | null;
  notes: string | null;
  grant_id: string | null;
  opportunity_id: string | null;
  funder: { id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null } | null;
  grant: { id: string; name: string } | null;
  opportunity: { id: string; name: string | null } | null;
};

export default async function AskDetailPage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("asks")
    .select(
      "*, funder:constituents(id, type, first_name, last_name, org_name), " +
        "grant:grants(id, name), opportunity:opportunities(id, name)"
    )
    .eq("id", params.id)
    .maybeSingle();
  const ask = data as unknown as AskRow | null;

  if (error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className={`${TYPE.pageTitle} mb-4`}>Ask Log</h1>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The ask log tables aren&apos;t in this database yet. Apply{" "}
          <code className="text-orange">create_asks_log.sql</code>, then reload.
        </div>
      </div>
    );
  }
  if (!ask) notFound();

  const { data: docsData } = await supabase
    .from("ask_documents")
    .select("id, filename, label, mime, size_bytes, created_at")
    .eq("ask_id", params.id)
    .order("created_at", { ascending: false });
  const documents = (docsData ?? []) as AskDocument[];

  const funder = ask.funder;
  const grant = ask.grant;
  const opportunity = ask.opportunity;

  const funderName = funder ? constituentName(funder) : "";
  const heading = ask.title || funderName || "Ask";

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1100px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader
          eyebrow={
            <Link href="/admin/fundraising/asks" className="hover:text-ink-1 transition-colors">
              ← Ask Log
            </Link>
          }
          title={
            <span className="flex items-center gap-3 flex-wrap">
              <span className="truncate">{heading}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange/15 text-orange uppercase tracking-wider">
                {ASK_FORM_LABELS[ask.form] ?? ask.form}
              </span>
            </span>
          }
          actions={<AskStatusSelect askId={ask.id} status={ask.status} />}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <section className="lg:col-span-5 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 space-y-4">
            <EditableAskDetails
              ask={{
                id: ask.id,
                funderId: funder?.id ?? null,
                funderName,
                form: ask.form,
                title: ask.title ?? null,
                amount_requested: ask.amount_requested != null ? Number(ask.amount_requested) : null,
                amount_committed: ask.amount_committed != null ? Number(ask.amount_committed) : null,
                ask_date: ask.ask_date ?? null,
                decided_on: ask.decided_on ?? null,
                owner: ask.owner ?? null,
                notes: ask.notes ?? null,
              }}
            />

            {(grant || opportunity) && (
              <div className="border-t border-outline pt-3 space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold">Linked to</div>
                {grant && (
                  <Link href={`/admin/fundraising/grants/${grant.id}`} className="block text-sm text-orange hover:text-orange-dark transition-colors">
                    Grant · {grant.name}
                  </Link>
                )}
                {opportunity && (
                  <Link href={`/admin/fundraising/donors`} className="block text-sm text-orange hover:text-orange-dark transition-colors">
                    Major gift · {opportunity.name || funderName}
                  </Link>
                )}
              </div>
            )}

            <div className="border-t border-outline pt-3">
              <DeleteAskButton askId={ask.id} />
            </div>
          </section>

          <section className="lg:col-span-7 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-outline flex items-center justify-between">
              <h2 className="font-heading font-bold text-ink-1 text-sm">Documents</h2>
              <span className="text-[11px] text-ink-3">{documents.length} file{documents.length === 1 ? "" : "s"}</span>
            </div>
            <AskDocuments askId={ask.id} documents={documents} />
          </section>
        </div>
      </div>
    </div>
  );
}
