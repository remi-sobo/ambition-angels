"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminUser } from "@/lib/admin/auth";

const NAV_LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/fundraising", label: "Fundraising" },
  { href: "/admin/ops", label: "Ops" },
  { href: "/admin/finance", label: "Finance" },
  { href: "/admin/board", label: "Board" },
  { href: "/admin/compliance", label: "Compliance" },
  { href: "/admin/program", label: "Program" },
];

// Active match: exact for /admin (so Dashboard isn't always lit), prefix for nested.
const isActive = (path: string, href: string) =>
  href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/");

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const fmtAgo = (iso: string): string => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
};

type SyncStatus = "running" | "completed" | "failed" | "partial";
type SyncResponse = {
  jobId: string;
  status: SyncStatus;
  finished_at: string | null;
  counts: { contacts: number; companies: number; deals: number; engagements: number };
  errors: Array<{ step: string; message: string }>;
};

const ZERO = { contacts: 0, companies: 0, deals: 0, engagements: 0 };

export default function Sidebar({ currentUser }: { currentUser: AdminUser | null }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [job, setJob] = useState<SyncResponse | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Polling design: POST every 2s while running. Each call advances the job
  // by one chunk AND returns the updated state. GET on mount only, to
  // hydrate "Last synced" so it survives full reloads.
  useEffect(() => {
    fetch("/api/admin/hubspot/sync")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.jobId && setJob(j as SyncResponse))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    pollRef.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/admin/hubspot/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.jobId }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setJob(await r.json());
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : "Sync failed");
        setJob((p) => (p ? { ...p, status: "failed" } : p));
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [job]);

  const startSync = useCallback(async () => {
    setSyncError(null);
    try {
      const r = await fetch("/api/admin/hubspot/sync", { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setJob(await r.json());
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    }
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await fetch("/api/admin/logout", { method: "POST" }); } catch {}
    router.push("/admin");
    router.refresh();
  };

  const counts = job?.counts ?? ZERO;
  const running = job?.status === "running";
  const partial = job?.status === "partial";
  const finished = job?.status === "completed" || partial;
  const syncLabel = syncError
    ? "Sync failed — retry"
    : running
    ? "Syncing…"
    : finished && job?.finished_at
    ? `${partial ? "Synced (partial)" : "Synced"} ${fmtAgo(job.finished_at)}`
    : "Sync HubSpot";

  return (
    <aside className="w-64 shrink-0 border-r border-white/10 bg-black/30 flex flex-col">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="font-display font-black text-lg uppercase tracking-tight text-cream">AA Admin</div>
        <div className="text-[11px] uppercase tracking-wider text-gray-mid mt-0.5">Operating System</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={[
              "block px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive(pathname, link.href)
                ? "bg-orange/15 text-orange border border-orange/30"
                : "text-cream/70 hover:text-cream hover:bg-white/5 border border-transparent",
            ].join(" ")}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-white/10 space-y-2">
        <button
          onClick={startSync}
          disabled={running}
          title={partial ? job?.errors.map((e) => `${e.step}: ${e.message}`).join("\n") : undefined}
          className="w-full text-left text-xs font-semibold text-cream/80 hover:text-cream bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-lg transition-colors disabled:cursor-default flex items-center gap-2"
        >
          <span aria-hidden className={running ? "animate-pulse" : ""}>{partial ? "⚠" : running ? "⟳" : "↻"}</span>
          <span className="truncate">{syncLabel}</span>
        </button>
        {(running || finished) && (
          <div className="text-[10px] text-gray-mid leading-relaxed font-mono">
            C {counts.contacts} · Co {counts.companies} · D {counts.deals} · E {counts.engagements}
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-white/10 space-y-3">
        <div className="text-xs text-gray-mid">
          {currentUser ? `Logged in as ${cap(currentUser)}` : "Logged in"}
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full text-xs font-semibold text-cream/60 hover:text-cream bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
    </aside>
  );
}
