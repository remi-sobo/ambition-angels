import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import PageHeader from "../../_components/PageHeader";
import PageShell from "../../_components/ui/PageShell";
import { TYPE } from "@/lib/admin/typeScale";
import { getOrgContext } from "@/lib/admin/auth";
import { getEntitlements, hasFeature } from "@/lib/admin/entitlements";
import { createServerSupabase } from "@/lib/supabase/server";
import { CAPTURE_DEFAULT_TZ } from "@/lib/capture/constants";
import ConfirmStack from "../_components/ConfirmStack";
import type { CaptureView, CardView } from "../_lib/cardView";

export const dynamic = "force-dynamic";

/**
 * /admin/capture/[id] (specs/bloomos-capture.md, C4): one recording's cards.
 *
 * Where an interrupted session resumes, and where ops_tasks.origin_path on a
 * filed capture task already points. Read through the session client, so
 * captures stay personal (another member's capture is a 404, as in the API).
 * Hidden entirely without ai.capture.
 */
export default async function CapturePage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const ctx = await getOrgContext();
  if (!ctx) notFound();
  const ents = await getEntitlements(ctx.orgId);
  if (!hasFeature(ents, "ai.capture")) notFound();

  const supabase = createServerSupabase();
  const { data: capture } = await supabase
    .from("captures")
    .select("id, status, transcript, created_at, parse_error")
    .eq("id", params.id)
    .maybeSingle();
  if (!capture) notFound();

  const { data: cards } = await supabase
    .from("capture_cards")
    .select(
      "id, position, dest, status, entity_type, entity_id, heard_name, match_confidence, match_candidates, payload, decided_at, applied_table, applied_id",
    )
    .eq("capture_id", params.id)
    .order("position", { ascending: true });

  const c = capture as CaptureView;
  const when = formatInTimeZone(new Date(c.created_at), CAPTURE_DEFAULT_TZ, "EEE MMM d, h:mm a");

  return (
    <PageShell width="reading">
      <PageHeader eyebrow={`Recorded ${when}`} title="Recording" />
      {c.status === "failed" ? (
        <div className="space-y-3">
          <p className={TYPE.body}>
            This recording couldn&apos;t be sorted into cards. Your words are below; record it again or type it from the ＋ menu.
          </p>
          {c.transcript && (
            <p className={`${TYPE.bodyMuted} whitespace-pre-wrap rounded-control border border-hairline bg-tile p-3`}>{c.transcript}</p>
          )}
        </div>
      ) : c.status === "parsing" ? (
        <p className={TYPE.bodyMuted}>Still sorting this one out. Refresh in a moment.</p>
      ) : (
        <ConfirmStack captureId={c.id} initial={{ capture: c, cards: (cards ?? []) as CardView[] }} />
      )}
    </PageShell>
  );
}
