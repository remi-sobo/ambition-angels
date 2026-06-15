"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ATTENDEES,
  ATTENDEE_TYPES,
  ATTENDEE_TAGS,
  TYPE_COLORS,
  type DemoDayAttendee,
} from "@/lib/demoday/attendees";

// ── Types ────────────────────────────────────────────────────────────────

type Status = "want_to_connect" | "contacted" | "following_up";

const STATUS_META: { value: Status; label: string; short: string }[] = [
  { value: "want_to_connect", label: "Want to connect", short: "Connect" },
  { value: "contacted", label: "Contacted", short: "Contacted" },
  { value: "following_up", label: "Following up", short: "Follow up" },
];

type NoteState = {
  note: string;
  starred: boolean;
  status: Status | null;
  updated_by?: string;
  updated_at?: string;
};

const EMPTY: NoteState = { note: "", starred: false, status: null };

type ServerNote = {
  attendee_key: string;
  note: string | null;
  starred: boolean;
  status: Status | null;
  updated_by: string | null;
  updated_at: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtAgo = (iso?: string): string => {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ── Component ────────────────────────────────────────────────────────────

export default function DemoDayTracker() {
  const [notes, setNotes] = useState<Record<string, NoteState>>({});
  const [loaded, setLoaded] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all"); // all | tracked | untracked | <Status>
  const [starredOnly, setStarredOnly] = useState(false);
  const [notedOnly, setNotedOnly] = useState(false);

  // Mirror of notes for the debounced saver to read the latest value without
  // re-creating the timer on every keystroke.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Initial load of saved notes.
  useEffect(() => {
    fetch("/api/admin/demoday/notes")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { notes: ServerNote[]; tableMissing?: boolean }) => {
        if (j.tableMissing) setTableMissing(true);
        const map: Record<string, NoteState> = {};
        for (const n of j.notes ?? []) {
          map[n.attendee_key] = {
            note: n.note ?? "",
            starred: !!n.starred,
            status: n.status ?? null,
            updated_by: n.updated_by ?? undefined,
            updated_at: n.updated_at ?? undefined,
          };
        }
        setNotes(map);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setSaveState = useCallback((key: string, s: SaveState) => {
    setSaveStates((prev) => ({ ...prev, [key]: s }));
    if (s === "saved") {
      clearTimeout(savedTimersRef.current[key]);
      savedTimersRef.current[key] = setTimeout(() => {
        setSaveStates((prev) => ({ ...prev, [key]: "idle" }));
      }, 1800);
    }
  }, []);

  const save = useCallback(
    async (key: string) => {
      const s = notesRef.current[key] ?? EMPTY;
      setSaveState(key, "saving");
      try {
        const r = await fetch("/api/admin/demoday/notes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attendee_key: key,
            note: s.note,
            starred: s.starred,
            status: s.status,
          }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const { note } = (await r.json()) as { note: ServerNote };
        setNotes((prev) => ({
          ...prev,
          [key]: {
            ...(prev[key] ?? EMPTY),
            updated_by: note.updated_by ?? undefined,
            updated_at: note.updated_at ?? undefined,
          },
        }));
        setSaveState(key, "saved");
      } catch {
        setSaveState(key, "error");
      }
    },
    [setSaveState]
  );

  // Update a key's state, optimistically. `debounce` is used for free-text so
  // we don't POST on every keystroke; star/status toggles save immediately.
  const update = useCallback(
    (key: string, patch: Partial<NoteState>, debounce = false) => {
      setNotes((prev) => ({ ...prev, [key]: { ...(prev[key] ?? EMPTY), ...patch } }));
      if (debounce) {
        clearTimeout(timersRef.current[key]);
        timersRef.current[key] = setTimeout(() => save(key), 700);
      } else {
        clearTimeout(timersRef.current[key]);
        save(key);
      }
    },
    [save]
  );

  const flush = useCallback(
    (key: string) => {
      if (timersRef.current[key]) {
        clearTimeout(timersRef.current[key]);
        delete timersRef.current[key];
        save(key);
      }
    },
    [save]
  );

  // ── Counts ────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    let starred = 0;
    let noted = 0;
    const byStatus: Record<Status, number> = {
      want_to_connect: 0,
      contacted: 0,
      following_up: 0,
    };
    for (const v of Object.values(notes)) {
      if (v.starred) starred++;
      if (v.note.trim()) noted++;
      if (v.status) byStatus[v.status]++;
    }
    return { starred, noted, byStatus };
  }, [notes]);

  // ── Filtering ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ATTENDEES.filter((a) => {
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (tagFilter !== "all" && !a.tags.includes(tagFilter)) return false;
      const n = notes[a.id];
      if (starredOnly && !n?.starred) return false;
      if (notedOnly && !n?.note.trim()) return false;
      if (statusFilter === "tracked" && !n?.status) return false;
      if (statusFilter === "untracked" && n?.status) return false;
      if (
        statusFilter !== "all" &&
        statusFilter !== "tracked" &&
        statusFilter !== "untracked" &&
        n?.status !== statusFilter
      )
        return false;
      if (q) {
        const hay = `${a.name} ${a.company} ${a.title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [search, typeFilter, tagFilter, statusFilter, starredOnly, notedOnly, notes]);

  const selectCls =
    "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-sm text-ink-1 focus:outline-none focus:border-orange/50";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Demo Day</h1>
          <p className="mt-2 text-zinc-400">
            Fast Forward demo-day contacts — note, star, and track the people to
            look out for.
          </p>
        </div>
        <a
          href="/demoday"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-ink-1 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-3 py-2 rounded-lg transition-colors"
        >
          Open lookbook ↗
        </a>
      </div>

      {tableMissing && (
        <div className="mt-4 rounded-lg border border-orange/40 bg-orange/10 px-4 py-3 text-sm text-orange">
          The notes table isn’t set up yet. Apply{" "}
          <code className="font-mono">supabase/migrations/create_demoday_notes.sql</code>{" "}
          to start saving — you can browse and filter now, but saves won’t persist.
        </div>
      )}

      {/* Summary chips */}
      <div className="mt-5 flex flex-wrap gap-2 text-xs">
        <Chip label={`${ATTENDEES.length} people`} />
        <Chip label={`★ ${counts.starred} starred`} />
        <Chip label={`${counts.noted} with notes`} />
        {STATUS_META.map((s) => (
          <Chip key={s.value} label={`${s.label}: ${counts.byStatus[s.value]}`} />
        ))}
      </div>

      {/* Filters */}
      <div className="admin-sticky-top sticky z-10 -mx-4 sm:-mx-6 lg:-mx-8 mt-5 px-4 sm:px-6 lg:px-8 py-3 bg-ink/95 backdrop-blur border-y border-outline">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, title…"
            className={`${selectCls} flex-1 min-w-[200px]`}
          />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectCls}>
            <option value="all">All types</option>
            {ATTENDEE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className={selectCls}>
            <option value="all">All tags</option>
            {ATTENDEE_TAGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
            <option value="all">Any status</option>
            <option value="tracked">Tracked</option>
            <option value="untracked">Untracked</option>
            {STATUS_META.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setStarredOnly((v) => !v)}
            className={[
              "px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
              starredOnly
                ? "bg-orange/15 text-orange border-orange/30"
                : "bg-tile text-ink-2 border-outline hover:text-ink-1",
            ].join(" ")}
          >
            ★ Starred
          </button>
          <button
            onClick={() => setNotedOnly((v) => !v)}
            className={[
              "px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
              notedOnly
                ? "bg-orange/15 text-orange border-orange/30"
                : "bg-tile text-ink-2 border-outline hover:text-ink-1",
            ].join(" ")}
          >
            Has note
          </button>
        </div>
        <div className="mt-2 text-xs text-ink-2">
          Showing {filtered.length} of {ATTENDEES.length}
        </div>
      </div>

      {/* List */}
      <div className="mt-4 space-y-3">
        {!loaded && <div className="text-sm text-ink-2">Loading notes…</div>}
        {loaded && filtered.length === 0 && (
          <div className="text-sm text-ink-2">No one matches these filters.</div>
        )}
        {filtered.map((a) => (
          <AttendeeCard
            key={a.id}
            attendee={a}
            state={notes[a.id] ?? EMPTY}
            saveState={saveStates[a.id] ?? "idle"}
            onToggleStar={() => update(a.id, { starred: !(notes[a.id]?.starred) })}
            onSetStatus={(s) =>
              update(a.id, { status: notes[a.id]?.status === s ? null : s })
            }
            onNoteChange={(v) => update(a.id, { note: v }, true)}
            onNoteBlur={() => flush(a.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-tile border-[1.5px] border-outline px-3 py-1 text-ink-2">
      {label}
    </span>
  );
}

function AttendeeCard({
  attendee: a,
  state,
  saveState,
  onToggleStar,
  onSetStatus,
  onNoteChange,
  onNoteBlur,
}: {
  attendee: DemoDayAttendee;
  state: NoteState;
  saveState: SaveState;
  onToggleStar: () => void;
  onSetStatus: (s: Status) => void;
  onNoteChange: (v: string) => void;
  onNoteBlur: () => void;
}) {
  const typeColor = TYPE_COLORS[a.type] ?? "#9A8B7C";
  return (
    <div className="rounded-card border-[1.5px] border-outline bg-surface shadow-panel p-4">
      <div className="flex items-start gap-3">
        <button
          onClick={onToggleStar}
          aria-label={state.starred ? "Unstar" : "Star"}
          className={[
            "mt-0.5 text-lg leading-none transition-colors",
            state.starred ? "text-orange" : "text-ink-3 hover:text-ink-2",
          ].join(" ")}
        >
          {state.starred ? "★" : "☆"}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-ink-1">{a.name}</span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{ backgroundColor: `${typeColor}22`, color: typeColor }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: typeColor }} />
              {a.type}
            </span>
          </div>
          <div className="text-sm text-ink-2">
            {a.title}
            {a.title && a.company ? " · " : ""}
            {a.company}
          </div>

          {a.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {a.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-tile px-1.5 py-0.5 text-[10px] text-ink-2"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {a.linkedinUrl && (
              <a
                href={a.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange/90 hover:text-orange"
              >
                LinkedIn ↗
              </a>
            )}
            {a.orgUrl && (
              <a
                href={a.orgUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-2 hover:text-ink-1"
              >
                {a.company || "Website"} ↗
              </a>
            )}
          </div>

          {a.ffwdNote && (
            <p className="mt-2 rounded-md bg-surface shadow-panel border border-hairline px-2.5 py-1.5 text-xs italic text-ink-2">
              <span className="not-italic font-semibold text-ink-3">FF intel: </span>
              {a.ffwdNote}
            </p>
          )}
        </div>

        {/* Status pills */}
        <div className="flex shrink-0 flex-col gap-1">
          {STATUS_META.map((s) => {
            const active = state.status === s.value;
            return (
              <button
                key={s.value}
                onClick={() => onSetStatus(s.value)}
                className={[
                  "rounded-md px-2 py-1 text-[11px] font-medium border transition-colors text-left whitespace-nowrap",
                  active
                    ? "bg-orange/15 text-orange border-orange/30"
                    : "bg-tile text-ink-3 border-outline hover:text-ink-1",
                ].join(" ")}
              >
                {active ? "✓ " : ""}
                {s.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* Note */}
      <div className="mt-3">
        <textarea
          value={state.note}
          onChange={(e) => onNoteChange(e.target.value)}
          onBlur={onNoteBlur}
          rows={2}
          placeholder="Add a note…"
          className="w-full resize-y rounded-lg bg-tile border-[1.5px] border-outline px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange/50"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-ink-2">
          <span>
            {state.updated_by
              ? `Last edited by ${state.updated_by} ${fmtAgo(state.updated_at)}`
              : ""}
          </span>
          <span
            className={[
              saveState === "error" ? "text-expense" : "text-ink-3",
            ].join(" ")}
          >
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "Saved ✓"}
            {saveState === "error" && "Save failed — retry"}
          </span>
        </div>
      </div>
    </div>
  );
}
