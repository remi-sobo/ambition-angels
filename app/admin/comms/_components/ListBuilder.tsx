"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "../../_components/ui/Button";
import Card from "../../_components/ui/Card";
import Badge from "../../_components/ui/Badge";
import Notice from "../../_components/ui/Notice";
import { SelectField, TextField, DateField, TextareaField } from "../../_components/ui/Field";
import { useSaveAction } from "../../_lib/useSaveAction";
import { useConfirm } from "../../_components/feedback/ConfirmProvider";
import { useToast } from "../../_components/feedback/ToastProvider";
import { TYPE } from "@/lib/admin/typeScale";
import { STARTS, startOf, withStart, tidy, type ListDefinition, type StartValue } from "@/lib/comms/lists";
import { normalizeTag } from "@/lib/comms/tags";

/**
 * Build a list and watch who is on it (specs/comms-v3-composer.md). Three
 * moves, top to bottom: pick where to start, narrow it, add or take off
 * people by hand. The right side is the list itself, re-read through the send
 * path's own resolver after every change, so the people shown are the people
 * an email would reach.
 */

type Person = { id: string; name: string; email: string; last_gift: string | null; lifetime_total: number; added: boolean };
type Preview = {
  recipients: number;
  excluded: { doNotContact: number; suppressed: number; noEmail: number };
  error: string | null;
  max_recipients: number;
  no_first_name: number;
  matching: number;
  page: number;
  pages: number;
  people: Person[];
  removed: Array<{ id: string; name: string }>;
};
type Found = { id: string; name: string; email: string | null };

const TYPE_OPTIONS = [
  { value: "", label: "People and organizations" },
  { value: "person", label: "People only" },
  { value: "organization", label: "Organizations only" },
];

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export default function ListBuilder({
  id,
  initialName,
  initialDefinition,
  forEmail = null,
}: {
  id?: string;
  initialName: string;
  initialDefinition: ListDefinition;
  /** Set when the builder was opened from an email: a draft's id, or "new"
   *  for an email not saved yet. Saving goes back there with the list chosen. */
  forEmail?: string | null;
}) {
  const router = useRouter();
  const save = useSaveAction();
  const confirm = useConfirm();
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [def, setDef] = useState<ListDefinition>(tidy(initialDefinition));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "write" | "delete">("");

  // Add by hand.
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [pasted, setPasted] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteResult, setPasteResult] = useState<{ added: number; unmatched: string[] } | null>(null);

  // Tags: the library to pick from, and tagging everyone on this list.
  const [library, setLibrary] = useState<Array<{ tag: string; count: number }>>([]);
  const [tagAll, setTagAll] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const loadLibrary = async () => {
    try {
      const res = await fetch("/api/admin/tags");
      const j = (await res.json()) as { tags?: Array<{ tag: string; count: number }> };
      if (res.ok) setLibrary(j.tags ?? []);
    } catch {
      /* the picker just stays empty */
    }
  };
  useEffect(() => {
    void loadLibrary();
  }, []);

  const start = startOf(def);
  const current = tidy(def);
  const key = JSON.stringify(current);
  const dirty = key !== JSON.stringify(tidy(initialDefinition)) || name.trim() !== initialName.trim();
  const seq = useRef(0);

  // The list, re-read 300 ms after the last change. Only the newest answer shows.
  useEffect(() => {
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/comms/lists/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ definition: current, page, find }),
        });
        const j = (await res.json()) as Preview;
        if (n === seq.current) setPreview(res.ok ? j : null);
      } catch {
        if (n === seq.current) setPreview(null);
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page, find]);

  // People search, 250 ms after typing stops.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setFound(null);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/comms/lists/people?q=${encodeURIComponent(q)}`);
        const j = (await res.json()) as { people?: Found[] };
        if (live) setFound(j.people ?? []);
      } catch {
        if (live) setFound([]);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  // Every edit builds on the latest definition, never one captured before an
  // await: a slow paste must not undo a "Take off" clicked while it ran.
  const change = (next: ListDefinition | ((prev: ListDefinition) => ListDefinition)) => {
    setDef(next);
    setPage(0);
  };
  const set = (k: keyof ListDefinition, v: string) => change((prev) => ({ ...prev, [k]: v }));
  const included = new Set(def.include_ids ?? []);

  const addPeople = (ids: string[]) =>
    change((prev) => {
      const inc = new Set(prev.include_ids ?? []);
      const exc = new Set(prev.exclude_ids ?? []);
      for (const pid of ids) {
        // Someone taken off by hand comes back by undoing that, not by adding twice.
        if (exc.has(pid)) exc.delete(pid);
        else inc.add(pid);
      }
      return { ...prev, include_ids: Array.from(inc), exclude_ids: Array.from(exc) };
    });
  const removePerson = (p: Person) =>
    change((prev) => {
      const inc = new Set(prev.include_ids ?? []);
      const exc = new Set(prev.exclude_ids ?? []);
      if (p.added) inc.delete(p.id);
      else exc.add(p.id);
      return { ...prev, include_ids: Array.from(inc), exclude_ids: Array.from(exc) };
    });
  const putBack = (pid: string) => change((prev) => ({ ...prev, exclude_ids: (prev.exclude_ids ?? []).filter((x) => x !== pid) }));

  const picked = def.tags ?? [];
  const toggleTag = (t: string) =>
    change((prev) => {
      const cur = prev.tags ?? [];
      const on = cur.some((x) => x.toLowerCase() === t.toLowerCase());
      return { ...prev, tags: on ? cur.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...cur, t] };
    });
  // A list's own tags stay pickable even if nobody carries them any more.
  const tagChoices = [...library.map((l) => l.tag), ...picked.filter((t) => !library.some((l) => l.tag.toLowerCase() === t.toLowerCase()))];

  const tagEveryone = async () => {
    const name = normalizeTag(tagAll);
    // Only ever tag the list that is on screen, never one still being counted.
    if (!name || !preview || loading || preview.error) return;
    const leftOutCount = preview.excluded.noEmail + preview.excluded.suppressed + preview.excluded.doNotContact;
    const total = preview.recipients + leftOutCount;
    const ok = await confirm({
      title: `Tag ${count(total, "person", "people")} "${name}"?`,
      body: `That is the ${count(preview.recipients, "person", "people")} shown${leftOutCount ? `, plus ${leftOutCount} on this list who can't be emailed` : ""}. You can take the tag off again from Tags.`,
      confirmLabel: "Tag them",
    });
    if (!ok) return;
    setTagBusy(true);
    const r = await save<{ people: number; changed: number }>({
      request: { url: "/api/admin/tags", method: "POST", body: { add: [name], definition: current } },
    });
    setTagBusy(false);
    if (!r.ok) return;
    toast.success(`${r.data.people.toLocaleString("en-US")} ${r.data.people === 1 ? "person is" : "people are"} now tagged "${name}".`);
    setTagAll("");
    void loadLibrary();
  };

  const matchPasted = async () => {
    setPasteBusy(true);
    setPasteResult(null);
    const r = await save<{ matched: Found[]; unmatched: string[] }>({
      request: { url: "/api/admin/comms/lists/people", method: "POST", body: { emails: pasted } },
    });
    setPasteBusy(false);
    if (!r.ok) return;
    addPeople(r.data.matched.map((m) => m.id));
    setPasteResult({ added: r.data.matched.length, unmatched: r.data.unmatched });
    setPasted("");
  };

  const persist = async (then: "list" | "write") => {
    if (!name.trim()) return;
    setBusy(then === "write" ? "write" : "save");
    const r = await save<{ id?: string }>({
      request: id
        ? { url: `/api/admin/segments/${id}`, method: "PATCH", body: { name, definition: current } }
        : { url: "/api/admin/segments", method: "POST", body: { name, definition: current } },
      success: "List saved.",
    });
    if (!r.ok) {
      setBusy("");
      return;
    }
    const listId = id ?? r.data.id;
    if (then === "write" && listId && forEmail && forEmail !== "new") {
      // Attach it to the draft this was opened from, then go back to it.
      const a = await save({ request: { url: `/api/admin/comms/${forEmail}`, method: "PATCH", body: { segment_id: listId } } });
      if (!a.ok) {
        setBusy("");
        return;
      }
      router.push(`/admin/comms/emails/${forEmail}/edit`);
    } else {
      router.push(then === "write" && listId ? `/admin/comms/emails/compose?list=${listId}` : "/admin/comms/lists");
    }
    router.refresh();
  };

  const remove = async () => {
    if (!id) return;
    const ok = await confirm({
      title: `Delete the list "${initialName}"?`,
      body: "Emails already sent to it keep their record. Drafts that use it will need a new list.",
      confirmLabel: "Delete list",
      destructive: true,
    });
    if (!ok) return;
    setBusy("delete");
    const r = await save({ request: { url: `/api/admin/segments/${id}`, method: "DELETE" }, success: "List deleted." });
    if (!r.ok) {
      setBusy("");
      return;
    }
    router.push("/admin/comms/lists");
    router.refresh();
  };

  const leftOut = preview
    ? [
        preview.excluded.noEmail ? `${preview.excluded.noEmail} have no email` : "",
        preview.excluded.suppressed ? `${preview.excluded.suppressed} unsubscribed or bounced` : "",
        preview.excluded.doNotContact ? `${preview.excluded.doNotContact} marked do not contact` : "",
      ].filter(Boolean)
    : [];
  const sendable = !!preview && !preview.error && preview.recipients > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-6 items-start">
      {/* ── Left: the three moves ── */}
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className={`${TYPE.cardTitle} mb-1`}>1. Start with</h2>
          <p className={`${TYPE.metadata} mb-3`}>The list keeps itself current: someone who gives tomorrow joins Donors tomorrow.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Start with">
            {STARTS.map((s) => {
              const on = s.value === start;
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => change((prev) => withStart(prev, s.value as StartValue))}
                  className={`min-h-[44px] rounded-control border px-3 py-2 text-left transition-colors ${
                    on ? "border-orange bg-orange/5 ring-1 ring-orange/25" : "border-hairline bg-surface hover:bg-tile"
                  }`}
                >
                  <span className={`block ${TYPE.body} font-semibold`}>{s.label}</span>
                  <span className={`block ${TYPE.metadata}`}>{s.hint}</span>
                </button>
              );
            })}
          </div>
        </Card>

        {start !== "picked" && (
          <Card>
            <h2 className={`${TYPE.cardTitle} mb-1`}>2. Narrow it</h2>
            <p className={`${TYPE.metadata} mb-3`}>All optional. Leave them empty to keep everyone from step 1.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField label="Gave at least ($, all time)" inputMode="decimal" value={def.min_total ?? ""} onChange={(e) => set("min_total", e.target.value)} />
              <SelectField label="Kind" options={TYPE_OPTIONS} value={def.type ?? ""} onChange={(e) => set("type", e.target.value)} />
              <DateField label="Last gift on or after" value={def.since ?? ""} onChange={(e) => set("since", e.target.value)} />
              <DateField label="Last gift before" value={def.before ?? ""} onChange={(e) => set("before", e.target.value)} />
            </div>
            <div className="mt-3">
              <p className={`${TYPE.fieldLabel} mb-1.5`}>Has any of these tags</p>
              {tagChoices.length === 0 ? (
                <p className={TYPE.metadata}>
                  No tags yet. <Link href="/admin/comms/tags" target="_blank" className="font-semibold text-orange">Tag some people</Link> (opens in a new tab) and they show up here.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Has any of these tags">
                  {tagChoices.map((t) => {
                    const on = picked.some((x) => x.toLowerCase() === t.toLowerCase());
                    const n = library.find((l) => l.tag.toLowerCase() === t.toLowerCase())?.count;
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleTag(t)}
                        className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors ${
                          on ? "border-orange bg-orange/10 text-ink-1" : "border-hairline bg-surface text-ink-2 hover:bg-tile"
                        }`}
                      >
                        {t}
                        {n !== undefined ? <span className="ml-1.5 font-normal text-ink-3">{n.toLocaleString("en-US")}</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}
              {def.tag ? (
                <p className={`${TYPE.metadata} mt-2`}>
                  Also narrowed to the tag &ldquo;{def.tag}&rdquo;.{" "}
                  <button type="button" className="font-semibold text-orange" onClick={() => set("tag", "")}>
                    Remove
                  </button>
                </p>
              ) : null}
            </div>
          </Card>
        )}

        <Card>
          <h2 className={`${TYPE.cardTitle} mb-1`}>{start === "picked" ? "2. Add people" : "3. Add people by hand"}</h2>
          <p className={`${TYPE.metadata} mb-3`}>
            {start === "picked" ? "Search for people, or paste a column of email addresses." : "Anyone the rules miss. Optional."}
          </p>
          <TextField
            label="Find someone"
            placeholder="A name, or a whole email address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {found && (
            <ul className="mt-2 divide-y divide-hairline rounded-control border border-hairline" aria-label="People found">
              {found.length === 0 && <li className={`px-3 py-2.5 ${TYPE.bodyMuted}`}>No one by that name in BloomOS.</li>}
              {found.map((p) => {
                const on = included.has(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-1.5 min-h-[44px]">
                    <div className="min-w-0 flex-1">
                      <div className={`${TYPE.body} truncate`}>{p.name}</div>
                      <div className={`${TYPE.metadata} truncate`}>{p.email ?? "No email on record, so they can't be emailed"}</div>
                    </div>
                    {on ? (
                      <Badge tone="success">Added</Badge>
                    ) : (
                      <Button size="sm" variant="secondary" disabled={!p.email} onClick={() => addPeople([p.id])}>
                        Add
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3">
            {!pasteOpen ? (
              <Button variant="quiet" size="sm" onClick={() => setPasteOpen(true)}>
                Paste a list of email addresses
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <TextareaField
                  label="Paste email addresses"
                  hint="From a spreadsheet column, an email's To line, anywhere. One per line or separated by commas."
                  rows={5}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                />
                <div>
                  <Button variant="secondary" loading={pasteBusy} disabled={!pasted.trim()} onClick={() => void matchPasted()}>
                    Find these people
                  </Button>
                </div>
              </div>
            )}
            {pasteResult && (
              <Notice
                tone={pasteResult.unmatched.length ? "warning" : "success"}
                className="mt-3"
                title={`Added ${count(pasteResult.added, "person", "people")}.`}
              >
                {pasteResult.unmatched.length > 0 && (
                  <>
                    {count(pasteResult.unmatched.length, "address is", "addresses are")} not in BloomOS yet, so{" "}
                    {pasteResult.unmatched.length === 1 ? "it was" : "they were"} left off: {pasteResult.unmatched.slice(0, 12).join(", ")}
                    {pasteResult.unmatched.length > 12 ? `, and ${pasteResult.unmatched.length - 12} more` : ""}. Add them in Donors &amp; Funders first.
                  </>
                )}
              </Notice>
            )}
          </div>
        </Card>

        <Card>
          <h2 className={`${TYPE.cardTitle} mb-3`}>Name and save</h2>
          <TextField label="List name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gave in 2025, not yet this year" maxLength={120} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="lg" loading={busy === "write"} disabled={!name.trim() || !sendable || busy !== ""} onClick={() => void persist("write")}>
              {forEmail ? "Save and use for this email" : "Save and write an email"}
            </Button>
            <Button size="lg" variant="secondary" loading={busy === "save"} disabled={!name.trim() || !!preview?.error || busy !== "" || (!!id && !dirty)} onClick={() => void persist("list")}>
              {id ? "Save changes" : "Save list"}
            </Button>
            {id && (
              <Button size="lg" variant="quiet" loading={busy === "delete"} disabled={busy !== ""} onClick={() => void remove()} className="ml-auto">
                Delete list
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* ── Right: the list itself ── */}
      <Card padded={false} className="lg:sticky lg:top-4">
        <div className="p-4 border-b border-hairline" aria-live="polite" data-testid="list-count">
          {preview?.error ? (
            <Notice tone="danger" inline title="This list emails nobody yet.">{preview.error}</Notice>
          ) : preview ? (
            <>
              <p className={TYPE.cardMetric}>
                {count(preview.recipients, "person", "people")}
                {loading ? <span className={`${TYPE.metadata} ml-2 font-normal`}>updating</span> : null}
              </p>
              <p className={`${TYPE.metadata} mt-1.5`}>
                would get an email sent to this list today.{" "}
                {leftOut.length ? `Left out: ${leftOut.join(", ")}.` : "No one is left out."}
              </p>
              {preview.no_first_name > 0 && (
                <p className={`${TYPE.metadata} mt-1`}>
                  {count(preview.no_first_name, "person has", "people have")} no first name. The email will use your fallback word for them.
                </p>
              )}
              {preview.recipients > preview.max_recipients && (
                <p className="text-xs text-expense mt-1">Over the {preview.max_recipients.toLocaleString("en-US")} limit for one email. Narrow it first.</p>
              )}
            </>
          ) : (
            <p className={TYPE.bodyMuted}>{loading ? "Counting..." : "Couldn't read the list just now."}</p>
          )}
        </div>

        {preview && !preview.error && (
          <>
            <div className="px-4 pt-3">
              <TextField
                label="Look for someone on this list"
                controlSize="md"
                value={find}
                onChange={(e) => {
                  setFind(e.target.value);
                  setPage(0);
                }}
                placeholder="Name or email"
                autoComplete="off"
              />
            </div>
            <ul className="divide-y divide-hairline mt-2" aria-label="People on this list">
              {preview.people.length === 0 && (
                <li className={`px-4 py-6 text-center ${TYPE.bodyMuted}`}>{find ? "No one on this list matches that." : "No one yet."}</li>
              )}
              {preview.people.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-1.5 min-h-[48px]">
                  <div className="min-w-0 flex-1">
                    <div className={`${TYPE.body} truncate`}>
                      {p.name} {p.added ? <Badge tone="accent">Added by hand</Badge> : null}
                    </div>
                    <div className={`${TYPE.metadata} truncate`}>
                      {p.email}
                      {p.last_gift ? ` · last gave ${day(p.last_gift)} · ${money(p.lifetime_total)} all time` : " · no gift yet"}
                    </div>
                  </div>
                  <Button size="sm" variant="quiet" aria-label={`Take ${p.name} off this list`} onClick={() => removePerson(p)}>
                    Take off
                  </Button>
                </li>
              ))}
            </ul>
            {preview.pages > 1 && (
              <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-hairline">
                <Button size="sm" variant="secondary" disabled={preview.page === 0} onClick={() => setPage(preview.page - 1)}>
                  Previous
                </Button>
                <span className={TYPE.metadata}>
                  Page {preview.page + 1} of {preview.pages}
                </span>
                <Button size="sm" variant="secondary" disabled={preview.page >= preview.pages - 1} onClick={() => setPage(preview.page + 1)}>
                  Next
                </Button>
              </div>
            )}
          </>
        )}

        {preview && !preview.error && preview.recipients > 0 && (
          <div className="px-4 py-3 border-t border-hairline flex flex-wrap items-end gap-2">
            <TextField
              label="Tag everyone on this list"
              controlSize="md"
              className="flex-1 min-w-[12rem]"
              value={tagAll}
              onChange={(e) => setTagAll(e.target.value)}
              placeholder="e.g. Fall appeal 2026"
              maxLength={40}
            />
            <Button variant="secondary" loading={tagBusy} disabled={!normalizeTag(tagAll) || loading} onClick={() => void tagEveryone()}>
              Tag them
            </Button>
          </div>
        )}

        {preview && preview.removed.length > 0 && (
          <div className="px-4 py-3 border-t border-hairline">
            <h3 className={`${TYPE.cardLabel} mb-1`}>Taken off by hand ({(def.exclude_ids ?? []).length})</h3>
            <ul className="flex flex-col">
              {preview.removed.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 min-h-[40px]">
                  <span className={`${TYPE.bodyMuted} truncate`}>{p.name}</span>
                  <Button size="sm" variant="quiet" onClick={() => putBack(p.id)}>
                    Put back
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
