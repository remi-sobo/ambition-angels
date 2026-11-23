"use client";

import { useEffect, useMemo, useState } from "react";
import { userMessage } from "@/lib/admin/errors";
import { TYPE } from "@/lib/admin/typeScale";
import { StaticTable } from "../_components/ui/DataTable";

// ── Types ────────────────────────────────────────────────────────────────

type Signup = {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  title: string | null;
  engagement: string[] | null;
  note: string | null;
  source: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

// Quote a CSV cell only when needed (commas, quotes, newlines).
const csvCell = (v: string): string =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

function toCsv(rows: Signup[]): string {
  const header = [
    "Date", "First name", "Last name", "Email", "Phone",
    "Company", "Role / title", "Interested in", "Note",
  ];
  const lines = rows.map((r) =>
    [
      fmtDate(r.created_at),
      r.first_name,
      r.last_name,
      r.email,
      r.phone ?? "",
      r.company ?? "",
      r.title ?? "",
      (r.engagement ?? []).join("; "),
      r.note ?? "",
    ]
      .map((c) => csvCell(String(c)))
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

// ── Component ────────────────────────────────────────────────────────────

export default function DemoDaySignups() {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/demoday/signups")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(userMessage(r)))))
      .then((j: { signups: Signup[]; tableMissing?: boolean }) => {
        if (j.tableMissing) setTableMissing(true);
        setSignups(j.signups ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoaded(true));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return signups;
    return signups.filter((s) =>
      [
        s.first_name, s.last_name, s.email, s.phone, s.company, s.title,
        (s.engagement ?? []).join(" "), s.note,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [signups, search]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `demoday-signups-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={TYPE.pageTitle}>Demo Day</h1>
          <p className="mt-2 text-ink-2">
            Supporters who signed up through the Demo Day form.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="text-xs font-semibold text-ink-1 hover:text-ink-1 bg-tile hover:bg-tile border-hairline px-3 py-2 rounded-control transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Export CSV
        </button>
      </div>

      {tableMissing && (
        <div className="mt-4 rounded-control border border-orange/40 bg-orange/10 px-4 py-3 text-sm text-orange">
          The signups table isn’t set up yet. Apply{" "}
          <code className="font-mono">supabase/migrations/create_demoday_signups.sql</code>{" "}
          to start collecting submissions.
        </div>
      )}

      {error && !tableMissing && (
        <div className="mt-4 rounded-control border border-expense/30 bg-expense-bg px-4 py-3 text-sm text-expense">
          Couldn’t load signups: {error}
        </div>
      )}

      {/* Summary + search */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-tile border-hairline px-3 py-1 text-xs text-ink-2">
          {signups.length} signup{signups.length === 1 ? "" : "s"}
        </span>
        <input
          type="search"
          aria-label="Search signups"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, company…"
          className="flex-1 min-w-[200px] max-w-sm rounded-control bg-tile border-hairline px-3 py-2 text-sm text-ink-1 placeholder:text-ink-2/60 focus:outline-none focus:border-orange/60"
        />
      </div>

      {/* Body */}
      {!loaded ? (
        <div className="mt-6 text-sm text-ink-2">Loading signups…</div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 text-sm text-ink-2">
          {signups.length === 0 ? "No signups yet." : "No signups match your search."}
        </div>
      ) : (
        // The kit table (V4 P1): cards under 640px.
        <div className="mt-5">
          <StaticTable
            label="Demo Day signups"
            noun={{ one: "signup", many: "signups" }}
            rows={filtered}
            getRowId={(s) => s.id}
            getRowLabel={(s) => `${s.first_name} ${s.last_name}`}
            columns={[
              { key: "name", header: "Name", card: "title", render: (s) => <span className="font-medium text-ink-1 whitespace-nowrap">{s.first_name} {s.last_name}</span> },
              { key: "when", header: "When", render: (s) => <span className="text-ink-2 whitespace-nowrap">{fmtDate(s.created_at)}</span> },
              {
                key: "email",
                header: "Email",
                render: (s) => (
                  <a href={`mailto:${s.email}`} className="text-orange hover:underline break-all">
                    {s.email}
                  </a>
                ),
              },
              { key: "phone", header: "Phone", render: (s) => <span className="text-ink-2 whitespace-nowrap">{s.phone || "—"}</span> },
              { key: "company", header: "Company / role", render: (s) => <span className="text-ink-2">{[s.company, s.title].filter(Boolean).join(" · ") || "—"}</span> },
              {
                key: "engagement",
                header: "Interested in",
                render: (s) =>
                  s.engagement && s.engagement.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {s.engagement.map((e) => (
                        <span key={e} className="rounded-full bg-orange/10 border border-orange/30 px-2 py-0.5 text-xs text-orange">
                          {e}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-ink-2">—</span>
                  ),
              },
              {
                key: "note",
                header: "Note",
                className: "max-w-xs",
                render: (s) => <span className="text-ink-1 whitespace-pre-wrap">{s.note || <span className="text-ink-2">—</span>}</span>,
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
