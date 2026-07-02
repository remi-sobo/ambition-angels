import type { createServerSupabase } from "@/lib/supabase/server";
import { constituentName } from "@/lib/fundraising/display";

// Resolve a saved-segment definition to email recipients. Mirrors the donor
// export filter keys (q, type, source, tag, min_total, since) and additionally
// requires an email and excludes do-not-contact constituents and suppressed
// addresses (email_suppressions: unsubscribes, bounces, complaints) — shared
// by the comms send + recipient-count preview.

export type Recipient = { id: string; firstName: string; name: string; email: string };

export type ResolvedRecipients = {
  recipients: Recipient[];
  // Segment members excluded from sending, by reason — surfaced in the UI so
  // "N recipients" is honest about who it leaves out.
  excluded: { doNotContact: number; suppressed: number; noEmail: number };
};

const CEILING = 10000;

type SupabaseLike = ReturnType<typeof createServerSupabase>;

export async function resolveRecipients(
  supabase: SupabaseLike,
  def: Record<string, string>
): Promise<ResolvedRecipients> {
  let query = supabase
    .from("constituents")
    .select("id, type, first_name, last_name, org_name, emails, source, tags, do_not_contact")
    .limit(CEILING);

  if (def.type === "person" || def.type === "organization") query = query.eq("type", def.type);
  if (def.source) query = query.eq("source", def.source);
  if (def.tag) query = query.contains("tags", [def.tag]);
  if (def.q) {
    const safe = def.q.replace(/[%,()]/g, " ").trim();
    if (safe) query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,org_name.ilike.%${safe}%`);
  }

  const { data: constituents } = await query;
  const excluded = { doNotContact: 0, suppressed: 0, noEmail: 0 };
  if (!constituents) return { recipients: [], excluded };

  // RLS scopes the suppression list to the caller's org. citext in the DB;
  // lowercase for the in-memory comparison.
  const { data: sup } = await supabase.from("email_suppressions").select("email").limit(CEILING);
  const suppressed = new Set(
    ((sup ?? []) as Array<{ email: string }>).map((s) => s.email.toLowerCase())
  );

  const minTotal = Number(def.min_total) || 0;
  const since = /^\d{4}-\d{2}-\d{2}$/.test(def.since ?? "") ? def.since : "";

  // Only aggregate giving when a giving filter is actually set.
  let agg: Map<string, { total: number; last: string }> | null = null;
  if (minTotal > 0 || since) {
    agg = new Map();
    const { data: gifts } = await supabase
      .from("gifts")
      .select("constituent_id, amount, gift_date")
      .not("constituent_id", "is", null)
      .limit(CEILING);
    for (const g of gifts ?? []) {
      const id = g.constituent_id as string;
      const cur = agg.get(id) ?? { total: 0, last: "" };
      cur.total += Number(g.amount);
      if (g.gift_date > cur.last) cur.last = g.gift_date;
      agg.set(id, cur);
    }
  }

  const recipients: Recipient[] = [];
  for (const c of constituents as Array<{
    id: string; type: string; first_name: string | null; last_name: string | null;
    org_name: string | null; emails: string[] | null; do_not_contact: boolean;
  }>) {
    // Giving filters define segment membership; exclusion counts below are
    // relative to the segment, not the whole constituent table.
    if (agg) {
      const a = agg.get(c.id) ?? { total: 0, last: "" };
      if (minTotal > 0 && a.total < minTotal) continue;
      if (since && (!a.last || a.last < since)) continue;
    }
    const email = (c.emails ?? [])[0];
    if (c.do_not_contact) { excluded.doNotContact += 1; continue; }
    if (!email) { excluded.noEmail += 1; continue; }
    if (suppressed.has(email.toLowerCase())) { excluded.suppressed += 1; continue; }
    recipients.push({ id: c.id, firstName: c.first_name ?? "", name: constituentName(c), email });
  }
  return { recipients, excluded };
}
