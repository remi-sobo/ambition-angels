"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { BriefContent } from "@/lib/agents/funder-research/types";
import Snapshot from "./BriefSections/Snapshot";
import WhatTheyCareAbout from "./BriefSections/WhatTheyCareAbout";
import HowWeFit from "./BriefSections/HowWeFit";
import People from "./BriefSections/People";
import GivingProfile from "./BriefSections/GivingProfile";
import MutualConnections from "./BriefSections/MutualConnections";
import MeetingPlaybook from "./BriefSections/MeetingPlaybook";
import SourceNotesAndGaps from "./BriefSections/SourceNotesAndGaps";
import RawResearchNotes from "./BriefSections/RawResearchNotes";

/**
 * Wrapper around the 9 brief sections. Owns the "Generate / Regenerate"
 * button + its loading + error states. The brief data itself comes
 * server-rendered from the page (single query); successful generation
 * triggers router.refresh() to pull the new row.
 *
 * Section open-by-default rules (from the spec):
 *   - 1 (snapshot): always rendered, no disclosure
 *   - 2 what_they_care_about, 3 how_we_fit, 7 meeting_playbook: <details open>
 *   - 4 people, 5 giving_profile, 6 mutual_connections, 8 sources, 9 raw_notes:
 *     <details> closed
 */

export type ExistingBrief = {
  id: string;
  content: BriefContent;
  template_version: string;
  status: "draft" | "final" | "archived";
  generated_at: string;
  created_by: "remi" | "shannon" | "agent" | null;
};

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function fmtAbsolute(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type ErrorBanner = {
  kind: "rate_limit" | "budget" | "agent" | "unknown";
  message: string;
};

export default function BriefPanel({
  hubspotId,
  brief,
}: {
  hubspotId: string;
  brief: ExistingBrief | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<ErrorBanner | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Ticker so the relative time updates without manual refresh.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!brief) return;
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [brief]);

  async function trigger() {
    setError(null);
    setWarning(null);
    setGenerating(true);
    try {
      const r = await fetch(
        `/api/admin/fundraising/research/${encodeURIComponent(hubspotId)}`,
        { method: "POST" }
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        const message =
          typeof body?.error === "string" ? body.error : `HTTP ${r.status}`;
        const kind: ErrorBanner["kind"] =
          r.status === 429
            ? "rate_limit"
            : r.status === 402
            ? "budget"
            : r.status === 502
            ? "agent"
            : "unknown";
        setError({ kind, message });
        return;
      }
      if (typeof body?.budgetWarning === "string" && body.budgetWarning) {
        setWarning(body.budgetWarning);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError({
        kind: "unknown",
        message:
          e instanceof Error
            ? e.message
            : "Network error contacting the agent endpoint.",
      });
    } finally {
      setGenerating(false);
    }
  }

  // ── Empty state ─────────────────────────────────────────────────────────
  if (!brief) {
    return (
      <section className="rounded-card border border-white/10 bg-black/30 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xs uppercase tracking-wider text-gray-mid">
              Research brief
            </h2>
            <p className="mt-1 text-sm text-cream/70">No research brief yet.</p>
          </div>
          <button
            onClick={trigger}
            disabled={generating}
            className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {generating ? "Researching…" : "Generate research brief"}
          </button>
        </div>
        {generating && (
          <p className="mt-3 text-xs text-cream/60 italic">
            Researching… this can take 30–90 seconds. Web search is running in
            the background.
          </p>
        )}
        {error && <ErrorBannerView err={error} onDismiss={() => setError(null)} />}
      </section>
    );
  }

  // ── Populated state ─────────────────────────────────────────────────────
  const c = brief.content;
  return (
    <section className="space-y-4">
      <header className="rounded-card border border-white/10 bg-black/30 p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="text-xs text-gray-mid">
          Brief generated{" "}
          <span
            className="text-cream"
            title={fmtAbsolute(brief.generated_at)}
          >
            {fmtRelative(brief.generated_at)}
          </span>
          {brief.template_version && (
            <span className="ml-3 text-[10px] uppercase tracking-wider text-cream/40 font-mono">
              tmpl {brief.template_version}
            </span>
          )}
        </div>
        <button
          onClick={trigger}
          disabled={generating}
          className="text-xs font-semibold text-orange hover:text-orange-dark bg-orange/10 hover:bg-orange/15 border border-orange/30 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
        >
          {generating ? "Researching…" : "Regenerate"}
        </button>
      </header>

      {generating && (
        <div className="rounded-lg border border-orange/30 bg-orange/[0.06] p-3 text-xs text-cream/80">
          Researching… this can take 30–90 seconds. Web search is running in
          the background.
        </div>
      )}

      {warning && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.05] p-3 text-xs text-amber-200">
          {warning}
        </div>
      )}

      {error && <ErrorBannerView err={error} onDismiss={() => setError(null)} />}

      <Snapshot text={c.snapshot} />
      <WhatTheyCareAbout data={c.what_they_care_about} defaultOpen />
      <HowWeFit data={c.how_we_fit} defaultOpen />
      <People data={c.people} />
      <GivingProfile data={c.giving_profile} />
      <MutualConnections data={c.mutual_connections} />
      <MeetingPlaybook data={c.meeting_playbook} defaultOpen />
      <SourceNotesAndGaps data={c.source_notes_and_gaps} />
      <RawResearchNotes text={c.raw_research_notes} />
    </section>
  );
}

function ErrorBannerView({
  err,
  onDismiss,
}: {
  err: ErrorBanner;
  onDismiss: () => void;
}) {
  const tone =
    err.kind === "rate_limit"
      ? "border-amber-400/40 bg-amber-400/[0.07] text-amber-200"
      : err.kind === "budget"
      ? "border-red-500/40 bg-red-500/[0.07] text-red-200"
      : "border-red-500/30 bg-red-500/[0.05] text-red-200";
  const title =
    err.kind === "rate_limit"
      ? "Rate limit hit"
      : err.kind === "budget"
      ? "Monthly budget exceeded"
      : "Agent error";
  return (
    <div
      className={`mt-3 rounded-lg border p-3 text-xs flex items-start justify-between gap-3 ${tone}`}
    >
      <div>
        <div className="font-semibold uppercase tracking-wider text-[10px] mb-1">
          {title}
        </div>
        <div>{err.message}</div>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-current/70 hover:text-current px-1"
      >
        ✕
      </button>
    </div>
  );
}
