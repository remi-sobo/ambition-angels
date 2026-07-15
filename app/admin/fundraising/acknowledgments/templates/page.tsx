import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import TemplateManager, { type AckTemplate } from "./_components/TemplateManager";
import { TYPE } from "@/lib/admin/typeScale";

// The acknowledgment template library: named, channel-specific thank-you
// templates with a {{first_name}} merge token and one default per channel. The
// IRS compliance/receipt language is NOT a template — it stays system-generated
// and is appended at send time, never edited here.
export const dynamic = "force-dynamic";

export default async function AckTemplatesPage() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("ack_templates")
    .select("id, name, subject_type, channel, subject, body, is_default")
    .order("subject_type")
    .order("channel")
    .order("name");
  const templates = (data ?? []) as AckTemplate[];

  return (
    <div className="min-h-screen bg-ink">
      <div className="bg-tile border-b border-outline px-4 lg:px-8 py-3 sm:py-4 sticky admin-sticky-top z-30 flex items-center gap-3">
        <Link
          href="/admin/fundraising/acknowledgments"
          className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors"
        >
          ← Acknowledgments
        </Link>
        <span className={`${TYPE.cardTitle} sm:text-base`}>Thank-you templates</span>
      </div>

      <div className="max-w-[900px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <p className="text-sm text-ink-2 leading-relaxed max-w-2xl">
          Named, channel-specific thank-you templates. Use the <code className="text-orange">{"{{first_name}}"}</code>{" "}
          token and it fills with the donor&apos;s name when you compose. Mark one as the default for a channel and
          the composer offers it first. The receipt language stays separate and is always appended automatically.
        </p>

        {error ? (
          <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 text-sm text-ink-2 leading-relaxed">
            The template table isn&apos;t in this database yet. Apply{" "}
            <code className="text-orange">ack_v2_1_schema_foundation.sql</code>, then reload.
          </div>
        ) : (
          <TemplateManager initial={templates} />
        )}
      </div>
    </div>
  );
}
