"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EntityProfile from "./EntityProfile";
import {
  GROUP_LABEL,
  GROUP_ORDER,
  matchPages,
  parseScope,
  type ProfilePayload,
  type SearchGroup,
  type SearchHit,
  type SearchKind,
} from "./types";

const RECENTS_KEY = "bloomos:recent-search";

/**
 * BloomOS global search overlay (Phase 1 — "navigator").
 *
 * Mounted once in app/admin/layout.tsx. Owns the open state and the global
 * shortcut listeners (⌘K / Ctrl+K, and "/" when not typing in a field). The
 * sidebar SearchTrigger opens it via a `bloomos:search:open` window event, so
 * the two stay decoupled — no shared provider needed.
 *
 * Results = live DB hits from /api/admin/search (debounced, abortable) merged
 * with client-side page/action matches. Grouped for display; a flat index
 * drives ↑/↓ keyboard nav. ↵ navigates, ⌘↵ opens in a new tab.
 */
export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dbHits, setDbHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Phase 3: opt-in deep search across notes & interaction history.
  const [includeNotes, setIncludeNotes] = useState(false);
  // Mode B (360° profile). profileId set = profile open; null = palette.
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  // Phase 4: recently-opened results (localStorage), shown when the box is empty.
  const [recents, setRecents] = useState<SearchHit[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const profileAbortRef = useRef<AbortController | null>(null);

  // Scope prefix ("task: loi") + the bare term that actually gets searched.
  const { term, scope } = useMemo(() => parseScope(query), [query]);

  // Load recents once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (raw) setRecents(JSON.parse(raw) as SearchHit[]);
    } catch {
      /* ignore malformed / unavailable storage */
    }
  }, []);

  const pushRecent = useCallback((hit: SearchHit) => {
    setRecents((prev) => {
      const id = hit.id ?? hit.href;
      const next = [hit, ...prev.filter((h) => (h.id ?? h.href) !== id || h.kind !== hit.kind)].slice(0, 6);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const closeProfile = useCallback(() => {
    setProfileId(null);
    setProfile(null);
    profileAbortRef.current?.abort();
    inputRef.current?.focus();
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setDbHits([]);
    setActiveIndex(0);
    setProfileId(null);
    setProfile(null);
    abortRef.current?.abort();
    profileAbortRef.current?.abort();
  }, []);

  // Open the 360° profile for a constituent (Mode B).
  const openProfile = useCallback((id: string) => {
    setProfileId(id);
    setProfile(null);
    const ctrl = new AbortController();
    profileAbortRef.current?.abort();
    profileAbortRef.current = ctrl;
    fetch(`/api/admin/search/profile?id=${encodeURIComponent(id)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!ctrl.signal.aborted) setProfile(data as ProfilePayload | null);
      })
      .catch(() => {});
  }, []);

  // ── Global open shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const openSearch = () => setOpen(true);
    window.addEventListener("bloomos:search:open", openSearch);

    const onKey = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K toggles from anywhere.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // "/" opens, but only when the user isn't already typing somewhere.
      if (e.key === "/" && !open) {
        const el = document.activeElement;
        const typing =
          el instanceof HTMLElement &&
          (el.tagName === "INPUT" ||
            el.tagName === "TEXTAREA" ||
            el.tagName === "SELECT" ||
            el.isContentEditable);
        if (!typing) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("bloomos:search:open", openSearch);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Focus the field + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes (or steps back from a profile), handled at the document level
  // so it works wherever focus is — including after opening a profile, when the
  // clicked result unmounts and focus falls back to <body>, outside the dialog
  // (which is why a dialog-only keydown handler missed it).
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (profileId) closeProfile();
      else close();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, profileId, close, closeProfile]);

  // ── Debounced, abortable DB fetch ──────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (term.length < 2) {
      setDbHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    const t = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(term)}${includeNotes ? "&notes=1" : ""}`, {
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((data) => setDbHits((data?.results ?? []) as SearchHit[]))
        .catch((err) => {
          if (err?.name !== "AbortError") setDbHits([]);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term, open, includeNotes]);

  // ── Group + flatten ────────────────────────────────────────────────────
  const groups = useMemo(() => {
    // Empty box → recently-opened results (Phase 4).
    if (term.length < 1) {
      return recents.length ? [{ group: "recent" as SearchGroup, items: recents }] : [];
    }
    const all = [...dbHits, ...matchPages(term)];
    const byGroup = new Map<SearchGroup, SearchHit[]>();
    for (const hit of all) {
      const list = byGroup.get(hit.group) ?? [];
      list.push(hit);
      byGroup.set(hit.group, list);
    }
    let ordered = GROUP_ORDER.flatMap((g) => {
      const items = byGroup.get(g);
      if (!items || items.length === 0) return [];
      items.sort((a, b) => b.score - a.score);
      return [{ group: g, items }];
    });
    // Scope prefix narrows to a single group.
    if (scope) ordered = ordered.filter((g) => g.group === scope);
    return ordered;
  }, [dbHits, term, scope, recents]);

  // Flat list mirrors visual order — the index space for ↑/↓ and ↵.
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    setActiveIndex(0);
  }, [flat.length, term]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`gs-opt-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const navigate = useCallback(
    (href: string, newTab: boolean) => {
      if (newTab) {
        window.open(href, "_blank", "noopener");
        return;
      }
      close();
      router.push(href);
    },
    [close, router]
  );

  const go = useCallback(
    (hit: SearchHit | undefined, newTab: boolean) => {
      if (!hit) return;
      pushRecent(hit); // Phase 4: remember what was opened.
      // People/orgs open the 360° profile by default — that's the headline use
      // case. ⌘-click / ⌘↵ skips it and jumps straight to the full page.
      if (hit.kind === "constituent" && hit.id && !newTab) {
        openProfile(hit.id);
        return;
      }
      navigate(hit.href, newTab);
    },
    [navigate, openProfile, pushRecent]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Escape is handled at the document level (above) so it works even when
    // focus has left the overlay. Here we only drive in-overlay navigation.
    if (profileId) return; // profile (Mode B): nav keys inert
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (flat.length ? (i + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Tab" && !e.shiftKey && flat[activeIndex]?.kind === "constituent") {
      // ⇥ expands the highlighted person/org into the 360° profile.
      e.preventDefault();
      const hit = flat[activeIndex];
      if (hit.id) openProfile(hit.id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[activeIndex], e.metaKey || e.ctrlKey);
    }
  };

  const activeHit = flat[activeIndex];

  if (!open) return null;

  const showEmpty = term.length >= 2 && !loading && flat.length === 0;
  const showHint = term.length < 2 && groups.length === 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 backdrop-blur-sm px-4 pt-[12vh]"
      onClick={close}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-card border-[1.5px] border-outline bg-ink shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
        role="dialog"
        aria-modal="true"
        aria-label="Search BloomOS"
        onKeyDown={onKeyDown}
      >
        {profileId ? (
          profile ? (
            <EntityProfile data={profile} onBack={closeProfile} onOpen={navigate} />
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-outline">
                <button
                  onClick={closeProfile}
                  aria-label="Back to search"
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-ink-3 hover:text-ink-1 hover:bg-tile transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <span className="text-sm text-ink-2">Loading profile…</span>
              </div>
            </div>
          )
        ) : (
          <>
        {/* Search field */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-outline">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5 shrink-0 text-ink-2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, deals, tasks, pages…"
            className="flex-1 bg-transparent text-ink-1 placeholder-ink-3 text-base focus:outline-none"
            role="combobox"
            aria-expanded
            aria-controls="gs-listbox"
            aria-activedescendant={flat.length ? `gs-opt-${activeIndex}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="shrink-0 text-[10px] font-medium text-ink-2 border border-outline rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div id="gs-listbox" role="listbox" className="flex-1 overflow-y-auto py-2">
          {showHint && (
            <p className="px-4 py-6 text-sm text-ink-2 text-center">
              Type a name, organization, deal, task, or page to jump to it.
              <br />
              <span className="text-ink-3 text-[12px]">
                Tip: prefix with <code>people:</code>, <code>deal:</code>, or <code>task:</code> to filter.
              </span>
            </p>
          )}
          {loading && flat.length === 0 && term.length >= 2 && (
            <p className="px-4 py-6 text-sm text-ink-2 text-center">Searching…</p>
          )}
          {showEmpty && (
            <p className="px-4 py-6 text-sm text-ink-2 text-center">
              No matches for “{term}”.
            </p>
          )}

          {groups.map((g) => (
            <div key={g.group} className="mb-1.5 last:mb-0">
              <div className="px-4 pt-2 pb-1 text-[10px] font-heading font-semibold uppercase tracking-[0.14em] text-ink-3">
                {GROUP_LABEL[g.group]}
              </div>
              {g.items.map((hit) => {
                const idx = flat.indexOf(hit);
                const active = idx === activeIndex;
                return (
                  <button
                    key={`${hit.kind}-${hit.id ?? hit.href}`}
                    id={`gs-opt-${idx}`}
                    role="option"
                    aria-selected={active}
                    onMouseMove={() => setActiveIndex(idx)}
                    onClick={(e) => go(hit, e.metaKey || e.ctrlKey)}
                    className={[
                      "w-full text-left flex items-center gap-3 px-4 py-2 transition-colors",
                      active ? "bg-orange-light" : "hover:bg-tile",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "shrink-0 w-7 h-7 rounded-lg flex items-center justify-center",
                        active ? "bg-orange/20 text-orange-mid" : "bg-tile text-ink-3",
                      ].join(" ")}
                      aria-hidden
                    >
                      <KindIcon kind={hit.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-ink-1 truncate">{hit.title}</span>
                      {hit.subtitle && (
                        <span className="block text-[11px] text-ink-2 truncate">{hit.subtitle}</span>
                      )}
                    </span>
                    {hit.badge && (
                      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-ink-3 border border-outline rounded-full px-1.5 py-px">
                        {hit.badge}
                      </span>
                    )}
                    {hit.kind === "constituent" && (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`shrink-0 w-3.5 h-3.5 ${active ? "text-orange-mid" : "text-ink-2"}`}
                        aria-hidden
                      >
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hints (context-aware: people/orgs open the profile) */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-outline text-[10px] text-ink-2">
          <Hint k="↑↓" label="navigate" />
          {activeHit?.kind === "constituent" ? (
            <>
              <Hint k="↵" label="profile" />
              <Hint k="⌘↵" label="open page" />
            </>
          ) : (
            <>
              <Hint k="↵" label="open" />
              <Hint k="⌘↵" label="new tab" />
            </>
          )}
          <button
            type="button"
            onClick={() => setIncludeNotes((v) => !v)}
            aria-pressed={includeNotes}
            title="Also search interaction notes & history"
            className={[
              "ml-auto flex items-center gap-1.5 rounded-full px-2 py-0.5 border transition-colors",
              includeNotes
                ? "border-orange/40 text-orange bg-orange-light"
                : "border-outline text-ink-2 hover:text-ink-1",
            ].join(" ")}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${includeNotes ? "bg-orange" : "bg-ink-3"}`}
              aria-hidden
            />
            Notes &amp; history
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="text-[10px] border border-outline rounded px-1 py-px text-ink-3">{k}</kbd>
      {label}
    </span>
  );
}

// Compact per-kind glyphs (inline SVG to match the Sidebar's icon convention).
function KindIcon({ kind }: { kind: SearchKind }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "w-4 h-4",
    "aria-hidden": true,
  };
  switch (kind) {
    case "constituent":
    case "student":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 20v-1a4.5 4.5 0 0 1 4.5-4.5h4a4.5 4.5 0 0 1 4.5 4.5v1" />
        </svg>
      );
    case "prospect":
    case "partner":
      return (
        <svg {...common}>
          <rect x="4.5" y="4" width="15" height="16" rx="2" />
          <path d="M8.5 8h3M8.5 12h3M8.5 16h3M15 8h.5M15 12h.5" />
        </svg>
      );
    case "grant":
    case "commitment":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v8M9.5 10.5a2.2 2.2 0 0 1 4 0c0 2.5-4 1.5-4 4a2.2 2.2 0 0 0 4 0" />
        </svg>
      );
    case "task":
      return (
        <svg {...common}>
          <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
          <path d="M8.5 12.5l2.5 2.5 4.5-5" />
        </svg>
      );
    case "project":
      return (
        <svg {...common}>
          <path d="M4 5.5h5l2 2.5h9V19H4V5.5z" />
        </svg>
      );
    case "cohort":
      return (
        <svg {...common}>
          <circle cx="8" cy="9" r="2.4" />
          <circle cx="16" cy="9" r="2.4" />
          <path d="M3.5 19v-.5A3.5 3.5 0 0 1 7 15h2M14.5 15h2.5a3.5 3.5 0 0 1 3.5 3.5v.5" />
        </svg>
      );
    case "booking":
      return (
        <svg {...common}>
          <rect x="4" y="6" width="16" height="14" rx="2" />
          <path d="M4 10.5h16M9 3.5V7M15 3.5V7" />
        </svg>
      );
    case "page":
    case "action":
    default:
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
  }
}
