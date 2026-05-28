"use client";

import { useEffect, useMemo, useState } from "react";

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
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
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
          <h1 className="text-3xl font-semibold">Demo Day</h1>
          <p className="mt-2 text-zinc-400">
            Supporters who signed up through the Demo Day form.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="text-xs font-semibold text-cream/80 hover:text-cream bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Export CSV
        </button>
      </div>

      {tableMissing && (
        <div className="mt-4 rounded-lg border border-orange/40 bg-orange/10 px-4 py-3 text-sm text-orange">
          The signups table isn’t set up yet. Apply{" "}
          <code className="font-mono">supabase/migrations/create_demoday_signups.sql</code>{" "}
          to start collecting submissions.
        </div>
      )}

      {error && !tableMissing && (
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Couldn’t load signups: {error}
        </div>
      )}

      {/* Summary + search */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-cream/70">
          {signups.length} signup{signups.length === 1 ? "" : "s"}
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, company…"
          className="flex-1 min-w-[200px] max-w-sm rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-cream placeholder:text-gray-mid/60 focus:outline-none focus:border-orange/60"
        />
      </div>

      {/* Body */}
      {!loaded ? (
        <div className="mt-6 text-sm text-gray-mid">Loading signups…</div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 text-sm text-gray-mid">
          {signups.length === 0 ? "No signups yet." : "No signups match your search."}
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="mt-5 space-y-3 lg:hidden">
            {filtered.map((s) => (
              <div key={s.id} className="rounded-card border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold text-cream">
                    {s.first_name} {s.last_name}
                  </span>
                  <span className="text-xs text-gray-mid whitespace-nowrap">
                    {fmtDate(s.created_at)}
                  </span>
                </div>
                <a
                  href={`mailto:${s.email}`}
                  className="mt-1 block text-sm text-orange hover:underline break-all"
                >
                  {s.email}
                </a>
                {(s.phone || s.company || s.title) && (
                  <div className="mt-1 text-sm text-gray-mid">
                    {[s.title, s.company, s.phone].filter(Boolean).join(" · ")}
                  </div>
                )}
                {s.engagement && s.engagement.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.engagement.map((e) => (
                      <span
                        key={e}
                        className="rounded-full bg-orange/10 border border-orange/30 px-2 py-0.5 text-[11px] text-orange"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                )}
                {s.note && (
                  <p className="mt-2 text-sm text-cream/80 whitespace-pre-wrap">{s.note}</p>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="mt-5 hidden lg:block overflow-x-auto rounded-card border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-gray-mid">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Company / role</th>
                  <th className="px-4 py-3 font-medium">Interested in</th>
                  <th className="px-4 py-3 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-white/5 align-top hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-gray-mid whitespace-nowrap">{fmtDate(s.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-cream whitespace-nowrap">
                      {s.first_name} {s.last_name}
                    </td>
                    <td className="px-4 py-3">
                      <a href={`mailto:${s.email}`} className="text-orange hover:underline">
                        {s.email}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-mid whitespace-nowrap">{s.phone || "—"}</td>
                    <td className="px-4 py-3 text-gray-mid">
                      {[s.company, s.title].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {s.engagement && s.engagement.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {s.engagement.map((e) => (
                            <span
                              key={e}
                              className="rounded-full bg-orange/10 border border-orange/30 px-2 py-0.5 text-[11px] text-orange"
                            >
                              {e}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-mid">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-cream/80 max-w-xs whitespace-pre-wrap">
                      {s.note || <span className="text-gray-mid">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
