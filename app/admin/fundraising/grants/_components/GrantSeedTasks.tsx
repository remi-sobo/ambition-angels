"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * "Seed starter tasks" prompt for a grant whose project has no tasks yet.
 * Drops the per-org grant-lifecycle checklist into the project via
 * POST /api/admin/grants/:id/seed-tasks, then refreshes so the tasks appear in
 * the panel below. The route is idempotent, so a double-click is harmless.
 */
export default function GrantSeedTasks({ grantId }: { grantId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function seed() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/grants/${grantId}/seed-tasks`, {
        method: "POST",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't seed starter tasks");
      setBusy(false);
    }
  }

  return (
    <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0 flex-1">
        <h3 className={TYPE.cardTitle}>Start the workspace</h3>
        <p className="text-xs text-ink-2 mt-0.5">
          Seed the grant lifecycle — LOI, budget, narrative, review, submit, report —
          as tasks you can work and reorder.
        </p>
      </div>
      <button
        onClick={seed}
        disabled={busy}
        className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg whitespace-nowrap self-start sm:self-auto"
      >
        {busy ? "Seeding…" : "Seed starter tasks"}
      </button>
      {error && <p className="text-expense text-xs sm:basis-full">{error}</p>}
    </div>
  );
}
