import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Capture C6: which history rows on a donor or partner page the viewer can
 * fix. A capture-filed row carries its card id in external_id; the viewer's
 * own cards come back through the SESSION client (capture_cards policies are
 * creator-only), so a row someone else recorded gets no Fix. Never the
 * service-role client, even on a page that otherwise uses it.
 */

export type FixTarget = {
  cardId: string;
  captureId: string;
  /** The sentence the card came from, or null when there isn't one. */
  sourceSentence: string | null;
  /** The 90-day purge has cleared the transcript (C5). */
  transcriptCleared: boolean;
};

const PURGE_DAYS = 90;
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Map card id -> fix target, for the rows filed by Capture. */
export async function loadFixTargets(
  rows: { external_source?: string | null; external_id?: string | null }[],
  now: Date = new Date(),
): Promise<Record<string, FixTarget>> {
  const ids = Array.from(new Set(rows.filter((r) => r.external_source === "capture").map((r) => r.external_id))).filter(isUuid);
  if (ids.length === 0) return {};
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("capture_cards")
    .select("id, capture_id, payload, created_at")
    .in("id", ids)
    .eq("status", "confirmed");
  const out: Record<string, FixTarget> = {};
  for (const c of (data ?? []) as { id: string; capture_id: string; payload: Record<string, unknown> | null; created_at: string }[]) {
    const sentence = typeof c.payload?.source_sentence === "string" ? c.payload.source_sentence.trim() : "";
    out[c.id] = {
      cardId: c.id,
      captureId: c.capture_id,
      sourceSentence: sentence || null,
      transcriptCleared: !sentence && now.getTime() - Date.parse(c.created_at) > PURGE_DAYS * 86_400_000,
    };
  }
  return out;
}
