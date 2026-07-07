"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusChip } from "../../../_components/StatusChip";
import EmptyState from "../../../_components/EmptyState";
import type { ReviewCycle } from "../../_lib/reviews";

const CARD = "rounded-card border-[1.5px] border-outline bg-tile shadow-tile";
const FIELD = "rounded-md border border-outline bg-surface px-2 py-1 text-sm text-ink-1 placeholder:text-ink-3";

const MODE_LABEL: Record<string, string> = {
  transparent: "Transparent",
  confidential: "Confidential",
  anonymous: "Anonymous",
};
const STATUS_TONE: Record<string, "neutral" | "due" | "healthy"> = {
  draft: "neutral",
  collecting: "due",
  synthesizing: "due",
  shared: "healthy",
  closed: "neutral",
};

type SubjectAssignment = {
  subjectId: string;
  name: string;
  upward: number;
  peers: number;
  thinGroup: boolean;
};

export default function ReviewsAdminClient({
  cycles,
  canManage,
}: {
  cycles: ReviewCycle[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", anonymity_mode: "confidential", min_raters_for_anonymity: "3" });
  const [warnings, setWarnings] = useState<Record<string, SubjectAssignment[]>>({});

  async function create() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/staff/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ name: "", anonymity_mode: "confidential", min_raters_for_anonymity: "3" });
        router.refresh();
      } else alert(((await res.json().catch(() => null)) as { error?: string })?.error ?? "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function generate(cycleId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/staff/reviews/${cycleId}/generate`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { subjects?: SubjectAssignment[]; inserted?: number; error?: string }
        | null;
      if (res.ok && body?.subjects) {
        setWarnings((w) => ({ ...w, [cycleId]: body.subjects!.filter((s) => s.thinGroup) }));
        router.refresh();
      } else alert(body?.error ?? "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(cycleId: string, status: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/staff/reviews/${cycleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {canManage && (
        <div className={`${CARD} p-4 flex flex-col gap-3`}>
          <p className="text-sm font-semibold text-ink-1">New review cycle</p>
          <div className="flex flex-wrap gap-2">
            <input
              className={`${FIELD} flex-1 min-w-[180px]`}
              placeholder="Cycle name (FY26 Mid-year)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <select
              className={FIELD}
              value={form.anonymity_mode}
              onChange={(e) => setForm({ ...form, anonymity_mode: e.target.value })}
            >
              <option value="confidential">Confidential</option>
              <option value="transparent">Transparent</option>
              <option value="anonymous">Anonymous</option>
            </select>
            <input
              className={`${FIELD} w-32`}
              type="number"
              min={1}
              value={form.min_raters_for_anonymity}
              onChange={(e) => setForm({ ...form, min_raters_for_anonymity: e.target.value })}
              title="Min raters for anonymity"
            />
            <button
              type="button"
              disabled={busy || !form.name.trim()}
              onClick={create}
              className="rounded-md bg-orange px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
            >
              Create
            </button>
          </div>
          <p className="text-xs text-ink-2">
            Confidential is the honest default on a small team: below the rater threshold, the subject sees only the
            synthesized summary, not raw rater rows.
          </p>
        </div>
      )}

      {cycles.length === 0 ? (
        <EmptyState label="cycles" hint="No review cycles yet. Create one to start collecting 360 feedback." />
      ) : (
        <ul className="flex flex-col gap-2">
          {cycles.map((c) => (
            <li key={c.id} className={`${CARD} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink-1">{c.name}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-ink-2">
                    <span>{MODE_LABEL[c.anonymity_mode]}</span>
                    <span className="text-ink-3">· threshold {c.min_raters_for_anonymity}</span>
                  </div>
                </div>
                <StatusChip status={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</StatusChip>
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-3">
                <Link
                  href={`/admin/staff/reviews/${c.id}`}
                  className="text-xs font-semibold text-orange hover:text-orange-dark"
                >
                  Fill my forms →
                </Link>
                {canManage && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => generate(c.id)}
                      className="text-xs font-semibold text-ink-2 hover:text-orange"
                    >
                      Generate assignments
                    </button>
                    <select
                      className={`${FIELD} text-xs`}
                      value={c.status}
                      disabled={busy}
                      onChange={(e) => setStatus(c.id, e.target.value)}
                    >
                      {["draft", "collecting", "synthesizing", "shared", "closed"].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              {warnings[c.id]?.length > 0 && (
                <div className="mt-3 rounded-md border border-status-watch/40 bg-status-watch-bg px-3 py-2 text-xs text-ink-1">
                  <p className="font-semibold">Small-team anonymity warning</p>
                  <p className="text-ink-2 mt-0.5">
                    These subjects have a single upward or peer rater — anonymity can’t be real, so their raw upward/peer
                    feedback stays confidential (subject sees the summary only):
                  </p>
                  <ul className="mt-1 list-disc list-inside">
                    {warnings[c.id].map((s) => (
                      <li key={s.subjectId}>
                        {s.name} — {s.upward} upward, {s.peers} peer
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
