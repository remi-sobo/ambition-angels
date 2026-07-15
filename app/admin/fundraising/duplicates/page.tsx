import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "../../finance/_components/charts";
import PageHeader from "../../_components/PageHeader";
import StatCard from "../../_components/StatCard";
import { constituentName } from "@/lib/fundraising/display";
import MergeControls, { type DupMember } from "./_components/MergeControls";
import { TYPE } from "@/lib/admin/typeScale";

// Epic M1 — duplicate detection (shared-email groups) + merge. Email is the
// strongest signal; name-only matching is deliberately excluded to avoid
// destructive false-positive merges.
export const dynamic = "force-dynamic";

type Constituent = {
  id: string; type: string; first_name: string | null; last_name: string | null;
  org_name: string | null; emails: string[] | null;
};

export default async function DuplicatesPage() {
  const supabase = createServerSupabase();
  const [cRes, giftsRes] = await Promise.all([
    supabase.from("constituents").select("id, type, first_name, last_name, org_name, emails").limit(20000),
    supabase.from("gifts").select("constituent_id, amount").not("constituent_id", "is", null).limit(20000),
  ]);

  if (cRes.error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className={`${TYPE.pageTitle} mb-4`}>Duplicates</h1>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The fundraising tables aren&apos;t in this database yet.
        </div>
      </div>
    );
  }

  const constituents = (cRes.data ?? []) as Constituent[];
  const giving = new Map<string, { gifts: number; total: number }>();
  for (const g of (giftsRes.data ?? []) as Array<{ constituent_id: string; amount: number }>) {
    const cur = giving.get(g.constituent_id) ?? { gifts: 0, total: 0 };
    cur.gifts += 1;
    cur.total += Number(g.amount);
    giving.set(g.constituent_id, cur);
  }

  // Group by any shared email (lowercased). A constituent can have several
  // emails; an email shared across >1 constituent flags a duplicate group.
  const byEmail = new Map<string, Set<string>>();
  const byId = new Map(constituents.map((c) => [c.id, c]));
  for (const c of constituents) {
    for (const e of c.emails ?? []) {
      const key = e.trim().toLowerCase();
      if (!key) continue;
      (byEmail.get(key) ?? byEmail.set(key, new Set()).get(key)!).add(c.id);
    }
  }

  // Build unique groups (a group keyed by its sorted member-id set).
  const seen = new Set<string>();
  const groups: Array<{ key: string; members: DupMember[] }> = [];
  for (const [, ids] of Array.from(byEmail.entries())) {
    if (ids.size < 2) continue;
    const sorted = Array.from(ids).sort();
    const key = sorted.join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const members: DupMember[] = sorted.map((id) => {
      const c = byId.get(id)!;
      const g = giving.get(id) ?? { gifts: 0, total: 0 };
      return { id, name: constituentName(c), email: (c.emails ?? [])[0] ?? "—", gifts: g.gifts, total: money(g.total) };
    });
    // Default-keep the richest record first (most gifts, then most given).
    members.sort((a, b) => b.gifts - a.gifts || parseFloat(b.total.replace(/[^0-9.]/g, "")) - parseFloat(a.total.replace(/[^0-9.]/g, "")));
    groups.push({ key, members });
  }

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1100px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader title="Duplicates" subtitle="Constituents sharing an email — review and merge" />

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Duplicate groups" value={groups.length} sub={groups.length > 0 ? "review below" : "none found"} muted={groups.length === 0} />
          <StatCard label="Constituents scanned" value={constituents.length} />
        </div>

        {groups.length === 0 ? (
          <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-8">
            <p className="text-ink-2 text-sm">No email-based duplicates found. Records sharing an email address will surface here for merging.</p>
          </section>
        ) : (
          <div className="space-y-3">
            {groups.map((grp) => (
              <section key={grp.key} className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5">
                <MergeControls members={grp.members} />
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
