"use client";

// Client pieces of the intake pipeline: application rows with screening
// actions (eligible/ineligible → waitlist/offer → accept/decline), priority
// tier + cohort assignment, and the per-cohort "offer next" button.

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CohortOption = { id: string; name: string };

export type ApplicationView = {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
  cohort_id: string | null;
  guardian_name: string | null;
  guardian_email: string | null;
  guardian_phone: string | null;
  motivation: string | null;
  referral: string | null;
  status: string;
  priority: number;
  created_at: string;
  waitlistPosition: number | null;
  cohortName: string;
};


const PRIORITY_LABELS: Record<number, string> = { 1: "High", 2: "Standard", 3: "Low" };

function useApi() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const call = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return { busy, call };
}

function ActionButton({
  label,
  onClick,
  disabled,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone?: "primary" | "neutral" | "danger";
}) {
  const cls =
    tone === "primary"
      ? "bg-orange/15 text-orange hover:bg-orange/25 font-semibold"
      : tone === "danger"
      ? "text-ink-2 hover:text-expense"
      : "bg-tile hover:bg-[#EFE6D4] text-ink-2";
  return (
    <button onClick={onClick} disabled={disabled} className={`px-2 py-1 rounded-md text-[11px] ${cls}`}>
      {label}
    </button>
  );
}

export function ApplicationRow({
  app,
  cohorts,
}: {
  app: ApplicationView;
  cohorts: CohortOption[];
}) {
  const { busy, call } = useApi();
  const [expanded, setExpanded] = useState(false);
  const patch = (fields: Record<string, unknown>) =>
    call(`/api/admin/applications/${app.id}`, "PATCH", fields);
  const closed = ["accepted", "ineligible", "declined", "expired"].includes(app.status);

  return (
    <article
      className={`bg-[#1d1812] border-[1.5px] border-outline rounded-xl p-3 text-sm ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink-1">{app.name}</span>
        {app.grade && <span className="text-[11px] text-ink-2">Grade {app.grade}</span>}
        {app.school && <span className="text-[11px] text-ink-2">· {app.school}</span>}
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-tile text-ink-2 uppercase tracking-wider">
          {app.cohortName}
        </span>
        {app.priority === 1 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange/15 text-orange uppercase tracking-wider">
            High priority
          </span>
        )}
        {app.waitlistPosition !== null && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-tile text-ink-2 uppercase tracking-wider">
            #{app.waitlistPosition} on waitlist
          </span>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-ink-2">
          applied {app.created_at.slice(0, 10)}
        </span>
      </div>

      {(app.guardian_name || app.guardian_email) && (
        <p className="text-[12px] text-ink-2 mt-1">
          {app.guardian_name ? `Guardian: ${app.guardian_name}` : "Contact:"}
          {app.guardian_email && (
            <a href={`mailto:${app.guardian_email}`} className="text-orange/80 hover:text-orange ml-1.5">
              {app.guardian_email}
            </a>
          )}
          {app.guardian_phone ? ` · ${app.guardian_phone}` : ""}
        </p>
      )}

      {app.motivation && (
        <p
          onClick={() => setExpanded((v) => !v)}
          className={`text-[12px] text-ink-2 mt-1.5 cursor-pointer ${expanded ? "" : "line-clamp-2"}`}
          title={expanded ? "Collapse" : "Expand"}
        >
          &ldquo;{app.motivation}&rdquo;
        </p>
      )}
      {app.referral && (
        <p className="text-[11px] text-ink-2 mt-1">Heard via: {app.referral}</p>
      )}

      <div className="flex flex-wrap items-center gap-1 mt-2">
        {!closed && (
          <>
            <select
              value={app.cohort_id ?? ""}
              disabled={busy}
              onChange={(e) => patch({ cohort_id: e.target.value || null })}
              className="text-[11px] bg-tile border-[1.5px] border-outline rounded-md px-2 py-1 text-ink-1 cursor-pointer max-w-[200px]"
            >
              <option value="" className="bg-[#1d1812]">No cohort</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#1d1812]">{c.name}</option>
              ))}
            </select>
            <select
              value={app.priority}
              disabled={busy}
              onChange={(e) => patch({ priority: Number(e.target.value) })}
              className="text-[11px] bg-tile border-[1.5px] border-outline rounded-md px-2 py-1 text-ink-1 cursor-pointer"
            >
              {[1, 2, 3].map((p) => (
                <option key={p} value={p} className="bg-[#1d1812]">{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </>
        )}

        {app.status === "new" && (
          <>
            <ActionButton label="Mark eligible" tone="primary" disabled={busy}
              onClick={() => void patch({ status: "eligible" })} />
            <ActionButton label="Ineligible" disabled={busy}
              onClick={() => void patch({ status: "ineligible" })} />
          </>
        )}
        {app.status === "eligible" && (
          <>
            <ActionButton label="Offer spot" tone="primary" disabled={busy}
              onClick={() => void patch({ status: "offered" })} />
            <ActionButton label="Waitlist" disabled={busy}
              onClick={() => void patch({ status: "waitlisted" })} />
          </>
        )}
        {app.status === "waitlisted" && (
          <ActionButton label="Offer spot" tone="primary" disabled={busy}
            onClick={() => void patch({ status: "offered" })} />
        )}
        {app.status === "offered" && (
          <>
            <ActionButton label="Accept → enroll" tone="primary" disabled={busy}
              onClick={() => void call(`/api/admin/applications/${app.id}/accept`, "POST")} />
            <ActionButton label="Declined" disabled={busy}
              onClick={() => void patch({ status: "declined" })} />
            <ActionButton label="Expire" disabled={busy}
              onClick={() => void patch({ status: "expired" })} />
          </>
        )}
        {closed && app.status !== "accepted" && (
          <ActionButton label="Reopen" disabled={busy}
            onClick={() => void patch({ status: "new" })} />
        )}
        {app.status === "accepted" && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-revenue-bg text-revenue uppercase tracking-wider">
            On the roster
          </span>
        )}

        <span className="ml-auto" />
        <ActionButton
          label="Delete"
          tone="danger"
          disabled={busy}
          onClick={() => {
            if (confirm(`Delete ${app.name}'s application?`))
              void call(`/api/admin/applications/${app.id}`, "DELETE");
          }}
        />
      </div>
    </article>
  );
}

export function OfferNextButton({ applicationId, name }: { applicationId: string; name: string }) {
  const { busy, call } = useApi();
  return (
    <button
      onClick={() =>
        void call(`/api/admin/applications/${applicationId}`, "PATCH", { status: "offered" })
      }
      disabled={busy}
      className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-orange/15 text-orange hover:bg-orange/25 disabled:opacity-50"
    >
      Offer next: {name}
    </button>
  );
}
