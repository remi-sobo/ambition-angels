"use client";

// Client controls for company profiles (specs/bloomos-companies.md, Stage 1):
// set or clear a company's stage, edit its email domains, and add a company
// from the Companies list. Every write goes through PATCH/POST
// /api/admin/constituents, the same routes the rest of the profile uses.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { userMessage } from "@/lib/admin/errors";
import {
  COMPANY_STAGES,
  COMPANY_STAGE_LABELS,
  type CompanyStage,
} from "@/lib/fundraising/company-stages";

const inputCls =
  "bg-tile border-hairline rounded-control px-3 py-2 text-ink-1 text-sm focus:outline-none focus:border-orange/40";
const primaryBtn =
  "text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-60";
const quietBtn =
  "text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile border-hairline px-3 py-1.5 rounded-full transition-colors disabled:opacity-60";

function usePatch(id: string) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const patch = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/constituents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => null);
      if (!res) {
        toast.error("Couldn't reach the server. Try again.");
        return false;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(userMessage(res, j));
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };
  return { patch, busy };
}

/** Stage picker on the profile. A menu, never a drag, so it can't change by accident. */
export function CompanyStageSelect({ id, stage }: { id: string; stage: CompanyStage }) {
  const { patch, busy } = usePatch(id);
  const confirm = useConfirm();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label htmlFor={`company-stage-${id}`} className="text-xs text-ink-2">
        Stage
      </label>
      <select
        id={`company-stage-${id}`}
        value={stage}
        disabled={busy}
        onChange={(e) => void patch({ company_stage: e.target.value })}
        className={inputCls}
      >
        {COMPANY_STAGES.map((s) => (
          <option key={s} value={s}>
            {COMPANY_STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy}
        className={quietBtn}
        onClick={async () => {
          const ok = await confirm({
            title: "Stop tracking as a company?",
            body: "It leaves the Companies list. Its gifts, grants and history stay on the record.",
            confirmLabel: "Stop tracking",
          });
          if (ok) await patch({ company_stage: null });
        }}
      >
        Stop tracking
      </button>
    </div>
  );
}

/** Shown on an organization that is not tracked as a company yet. */
export function TrackAsCompanyButton({ id }: { id: string }) {
  const { patch, busy } = usePatch(id);
  return (
    <button type="button" disabled={busy} className={primaryBtn} onClick={() => void patch({ company_stage: "identified" })}>
      Track as a company
    </button>
  );
}

/**
 * Email domains used to match intake to this company (Stage 3). A suggested
 * domain (from HubSpot) is offered, never written silently.
 */
export function CompanyDomains({
  id,
  domains,
  suggested,
}: {
  id: string;
  domains: string[];
  suggested: string | null;
}) {
  const { patch, busy } = usePatch(id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(domains.join(", "));
  useEffect(() => setDraft(domains.join(", ")), [domains]);

  const save = async () => {
    const list = draft.split(/[,\s]+/).filter(Boolean);
    if (await patch({ domains: list })) setEditing(false);
  };

  const offer = suggested && !domains.includes(suggested) ? suggested : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-ink-2">Email domains</span>
        {!editing &&
          (domains.length > 0 ? (
            domains.map((d) => (
              <span key={d} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface border-hairline text-ink-1">
                {d}
              </span>
            ))
          ) : (
            <span className="text-xs text-ink-2">None yet</span>
          ))}
        {!editing && (
          <button type="button" className={quietBtn} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      {editing && (
        <form
          className="flex items-center gap-2 flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            aria-label="Email domains, separated by commas"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="example.com"
            className={`${inputCls} min-w-[240px]`}
          />
          <button type="submit" disabled={busy} className={primaryBtn}>
            Save
          </button>
          <button
            type="button"
            className={quietBtn}
            onClick={() => {
              setDraft(domains.join(", "));
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </form>
      )}
      {offer && !editing && (
        <div className="flex items-center gap-2 flex-wrap text-xs text-ink-2">
          <span>HubSpot lists {offer} for this company.</span>
          <button
            type="button"
            disabled={busy}
            className={quietBtn}
            onClick={() => void patch({ domains: [...domains, offer] })}
          >
            Add {offer}
          </button>
        </div>
      )}
      <p className="text-xs text-ink-2">
        Used to suggest a match when someone from this company writes in. A person always confirms the match.
      </p>
    </div>
  );
}

type SearchResult = { kind: string; id: string; name: string; type: string };

/**
 * "Add a company": search existing organizations first and set the stage on
 * the one chosen. Creating a new record is the fallback, so the HubSpot import
 * does not end up with a second copy of the same company.
 */
export function AddCompany() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/constituents/search?q=${encodeURIComponent(term)}`).catch(() => null);
      const j = res?.ok ? await res.json().catch(() => null) : null;
      const rows = ((j?.results ?? []) as SearchResult[]).filter(
        (r) => r.kind === "constituent" && r.type === "organization",
      );
      setResults(rows);
      setSearched(true);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const track = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/constituents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_stage: "identified" }),
      }).catch(() => null);
      if (!res || !res.ok) {
        const j = res ? await res.json().catch(() => ({})) : {};
        toast.error(res ? userMessage(res, j) : "Couldn't reach the server. Try again.");
        return;
      }
      router.push(`/admin/fundraising/donors-funders/${id}`);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const name = q.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/constituents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "organization", org_name: name }),
      }).catch(() => null);
      const j = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok || typeof j.id !== "string") {
        toast.error(res ? userMessage(res, j) : "Couldn't reach the server. Try again.");
        return;
      }
      await track(j.id);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={primaryBtn}>
        + Add a company
      </button>
    );
  }

  return (
    <div className="bg-surface border-hairline rounded-panel-lg p-4 space-y-3 w-full sm:w-[420px]">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          aria-label="Company name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search organizations already in BloomOS"
          className={`${inputCls} flex-1`}
        />
        <button type="button" className={quietBtn} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {results.length > 0 && (
        <ul className="space-y-1">
          {results.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-1 truncate">{r.name}</span>
              <button type="button" disabled={busy} className={quietBtn} onClick={() => void track(r.id)}>
                Track this one
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && (
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-hairline">
          <span className="text-xs text-ink-2">
            {results.length === 0 ? "No organization by that name yet." : "Not in the list?"}
          </span>
          <button type="button" disabled={busy} className={quietBtn} onClick={() => void create()}>
            Create &ldquo;{q.trim()}&rdquo;
          </button>
        </div>
      )}
    </div>
  );
}
