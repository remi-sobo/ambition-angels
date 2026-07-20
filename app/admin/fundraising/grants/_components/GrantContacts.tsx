"use client";

// Client controls for a grant's Contacts section: person typeahead (pick an
// existing person constituent or type a new one — find-or-created by email
// server-side), row edit (role / primary / unlink). Same shape as the
// requirement rows: call the admin API, then router.refresh().

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GRANT_CONTACT_ROLES,
  GRANT_CONTACT_ROLE_LABELS,
  type GrantContact,
} from "@/lib/fundraising/grantContacts";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

const CUSTOM_ROLE = "__custom__";

// Role select seeded with the suggested set; "Custom…" swaps to free text
// (the column is free text on purpose).
function RoleField({
  role,
  setRole,
  custom,
  setCustom,
}: {
  role: string;
  setRole: (v: string) => void;
  custom: string;
  setCustom: (v: string) => void;
}) {
  return (
    <>
      <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls + " text-xs"}>
        {GRANT_CONTACT_ROLES.map(([v, l]) => (
          <option key={v} value={v} className="bg-tile shadow-tile">{l}</option>
        ))}
        <option value={CUSTOM_ROLE} className="bg-tile shadow-tile">Custom…</option>
      </select>
      {role === CUSTOM_ROLE && (
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Role"
          className={inputCls + " text-xs w-36"}
          autoFocus
        />
      )}
    </>
  );
}

const roleValue = (role: string, custom: string): string | null =>
  role === CUSTOM_ROLE ? custom.trim() || null : role;

// ── Person typeahead ────────────────────────────────────────────────────────
// FunderPicker's pattern, pointed at the constituent search and filtered to
// person constituents. A typed name that isn't picked becomes a new person
// (find-or-created by email server-side so the CRM stays deduped).

type PersonChoice = { constituentId: string | null; name: string };
type SearchResult = { kind: string; id: string | null; name: string; type: string; email: string | null };

function PersonPicker({
  value,
  onChange,
  autoFocus = false,
}: {
  value: PersonChoice;
  onChange: (next: PersonChoice) => void;
  autoFocus?: boolean;
}) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const query = value.name;

  useEffect(() => {
    if (value.constituentId) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/constituents/search?q=${encodeURIComponent(q)}`);
        const j = await res.json().catch(() => ({}));
        if (!cancelled) {
          const all = Array.isArray(j.results) ? (j.results as SearchResult[]) : [];
          setResults(all.filter((r) => r.kind === "constituent" && r.type === "person" && r.id));
          setOpen(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, value.constituentId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const typed = query.trim();
  const exactMatch = results.some((r) => r.name.toLowerCase() === typed.toLowerCase());

  return (
    <div ref={boxRef} className="relative w-56">
      <input
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange({ constituentId: null, name: e.target.value });
          setOpen(true);
        }}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        placeholder="Search people…"
        className={inputCls + " w-full text-xs"}
      />
      {value.constituentId && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-revenue bg-revenue-bg border border-revenue/30 px-1.5 py-0.5 rounded-full">
          linked
        </span>
      )}
      {open && typed.length >= 2 && (
        <div className="absolute z-20 mt-1 w-full bg-tile border-[1.5px] border-outline rounded-lg shadow-tile max-h-64 overflow-auto">
          {loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-ink-3">Searching…</div>
          )}
          {results.map((r) => (
            <button
              type="button"
              key={r.id}
              onClick={() => {
                onChange({ constituentId: r.id, name: r.name });
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-orange/10 flex items-center justify-between gap-2"
            >
              <span className="text-sm text-ink-1 truncate">{r.name}</span>
              {r.email && (
                <span className="text-[10px] text-ink-3 truncate flex-shrink-0 max-w-[45%]">{r.email}</span>
              )}
            </button>
          ))}
          {!exactMatch && (
            <button
              type="button"
              onClick={() => {
                onChange({ constituentId: null, name: typed });
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 border-t border-outline hover:bg-orange/10 text-xs text-orange font-semibold"
            >
              + New person “{typed}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Contact row: read view + inline role edit + primary/unlink actions ──────

export function GrantContactRow({ contact: c }: { contact: GrantContact }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const suggested = GRANT_CONTACT_ROLES.some(([v]) => v === (c.role ?? ""));
  const [role, setRole] = useState(c.role ? (suggested ? c.role : CUSTOM_ROLE) : "other");
  const [custom, setCustom] = useState(c.role && !suggested ? c.role : "");

  const name = c.constituent
    ? [c.constituent.first_name, c.constituent.last_name].filter(Boolean).join(" ") ||
      c.constituent.org_name ||
      "Unnamed person"
    : "Unknown contact";
  const email = c.constituent?.emails?.[0] ?? null;

  const patch = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/grants/contacts/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove ${name} from this grant? (The contact record is kept.)`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/grants/contacts/${c.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="px-5 py-3 flex items-center gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {c.constituent ? (
            <Link
              href={`/admin/fundraising/donors/${c.constituent.id}`}
              className="text-sm text-ink-1 font-medium truncate hover:text-orange transition-colors"
            >
              {name}
            </Link>
          ) : (
            <span className="text-sm text-ink-1 font-medium truncate">{name}</span>
          )}
          {c.is_primary && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange/15 text-orange uppercase tracking-wider">
              Primary
            </span>
          )}
        </div>
        <div className="text-[11px] text-ink-2 truncate">
          {c.role ? GRANT_CONTACT_ROLE_LABELS[c.role] ?? c.role : "No role"}
          {email ? ` · ${email}` : ""}
        </div>
      </div>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void patch({ role: roleValue(role, custom) });
          }}
          className="flex items-center gap-2 flex-wrap"
        >
          <RoleField role={role} setRole={setRole} custom={custom} setCustom={setCustom} />
          <button
            type="submit"
            disabled={busy}
            className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-[11px] font-semibold text-ink-2 hover:text-ink-1 transition-colors"
          >
            Cancel
          </button>
        </form>
      ) : (
        <span className="flex items-center gap-2">
          <button
            disabled={busy}
            onClick={() => setEditing(true)}
            className="text-[11px] font-semibold text-ink-3 hover:text-orange transition-colors disabled:opacity-50"
          >
            Edit
          </button>
          {!c.is_primary && (
            <button
              disabled={busy}
              onClick={() => void patch({ is_primary: true })}
              className="text-[11px] font-semibold text-ink-3 hover:text-orange transition-colors disabled:opacity-50"
            >
              Make primary
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => void remove()}
            className="text-[11px] font-semibold text-ink-3 hover:text-expense transition-colors disabled:opacity-50"
          >
            Remove
          </button>
        </span>
      )}
      {error && <p className="text-expense text-[11px] w-full">{error}</p>}
    </li>
  );
}

// ── Add form: picker + role + (for a new person) email ──────────────────────

export function AddGrantContactForm({ grantId }: { grantId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [person, setPerson] = useState<PersonChoice>({ constituentId: null, name: "" });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("program_officer");
  const [custom, setCustom] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const typed = person.name.trim();
    if (!person.constituentId && !typed) {
      setError("Pick a person or type a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // A typed (unpicked) name becomes a new person: first token is the
      // first name, the rest the last name.
      const [firstName, ...rest] = typed.split(/\s+/);
      const res = await fetch(`/api/admin/grants/${grantId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(person.constituentId
            ? { constituent_id: person.constituentId }
            : { first_name: firstName, last_name: rest.join(" ") || undefined, email: email.trim() || undefined }),
          role: roleValue(role, custom),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setPerson({ constituentId: null, name: "" });
      setEmail("");
      setCustom("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add contact");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-outline">
      <PersonPicker value={person} onChange={setPerson} />
      {!person.constituentId && person.name.trim() && (
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (dedupes)"
          className={inputCls + " text-xs w-44"}
        />
      )}
      <RoleField role={role} setRole={setRole} custom={custom} setCustom={setCustom} />
      <button
        type="submit"
        disabled={busy}
        className="text-xs font-semibold text-orange bg-orange/10 border border-orange/30 px-3 py-2 rounded-lg hover:bg-orange/20 transition-colors disabled:opacity-50"
      >
        {busy ? "Adding…" : "+ Add contact"}
      </button>
      {error && <p className="text-expense text-xs w-full">{error}</p>}
    </form>
  );
}
