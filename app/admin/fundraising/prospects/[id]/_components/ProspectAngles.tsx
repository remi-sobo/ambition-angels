"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";

// Which strategy angles this prospect is on, plus add-to-angle. A prospect can
// belong to several angles (many-to-many) — this is the prospect side of the
// funnel unification.

export type OnAngle = { id: string; angleKey: string; angleName: string; stage: string };
type AngleLite = { id: string; key: string; name: string };

export default function ProspectAngles({
  prospectId,
  onAngles,
  allAngles,
}: {
  prospectId: string;
  onAngles: OnAngle[];
  allAngles: AngleLite[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState(false);

  const onIds = new Set(onAngles.map((a) => a.angleName));
  const available = allAngles.filter((a) => !onIds.has(a.name));

  async function add() {
    if (!sel) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/strategy/funder-angles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: prospectId, angle_id: sel }),
      });
      if (r.status !== 409 && !r.ok) throw new Error();
      setSel("");
      router.refresh();
    } catch {
      alert("Could not add to angle — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
      <h2 className={`${TYPE.cardTitle} mb-3`}>Strategy angles</h2>

      {onAngles.length === 0 ? (
        <p className="text-sm text-ink-3 mb-3">Not on any angle yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {onAngles.map((a) => (
            <Link
              key={a.id}
              href={`/admin/fundraising/strategy/${a.angleKey}`}
              className="text-xs font-medium text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline rounded-full px-3 py-1 transition-colors"
            >
              {a.angleName} <span className="text-ink-3 capitalize">· {a.stage}</span>
            </Link>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="bg-tile border-[1.5px] border-outline rounded-lg px-2.5 py-1.5 text-xs text-ink-1 focus:outline-none focus:border-orange/50"
          >
            <option value="">Add to an angle…</option>
            {available.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button
            onClick={add}
            disabled={!sel || busy}
            className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
          >
            {busy ? "…" : "Add"}
          </button>
        </div>
      )}
    </section>
  );
}
