"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";

// Spec Fundraising F2, decision 1 (signed): the why-they-matter narrative is
// constituents.why_matters — written by a HUMAN here, through the ordinary
// constituent PATCH route. Reed may draft into reed_drafts for approval but
// never writes the column; there is deliberately no generate button on this
// panel.

export default function WhyTheyMatter({
  constituentId,
  name,
  initial,
}: {
  constituentId: string;
  name: string;
  initial: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/constituents/${constituentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ why_matters: text }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Save failed — try again.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg px-5 py-4">
      <div className="flex items-center gap-3 mb-2">
        <h2 className={TYPE.cardTitle}>Why They Matter</h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto text-[11px] font-semibold text-ink-2 hover:text-orange transition-colors"
          >
            {initial ? "Edit" : "Write it"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={`In a sentence or three: why ${name} matters to this mission — the relationship, not the math.`}
            className="w-full text-sm bg-tile border-[1.5px] border-outline rounded-xl px-3 py-2 text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange leading-relaxed"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark rounded-full px-4 py-1.5 transition-colors disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setText(initial ?? "");
              }}
              className="text-xs text-ink-3 hover:text-ink-1"
            >
              Cancel
            </button>
            {error && <span className="text-[11px] text-expense">{error}</span>}
            <span className="ml-auto text-[10px] text-ink-3">
              Human-written. Reed can draft one for approval; it never writes here.
            </span>
          </div>
        </div>
      ) : initial ? (
        <p className="text-sm text-ink-1 leading-relaxed whitespace-pre-wrap">{initial}</p>
      ) : (
        <p className="text-sm text-ink-3 leading-relaxed">
          Nothing written yet. This is the narrative a number can&apos;t carry — why this
          relationship matters, in a human&apos;s words.
        </p>
      )}
    </section>
  );
}
