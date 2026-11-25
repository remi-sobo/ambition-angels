"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "../../_components/ui/Button";
import Card from "../../_components/ui/Card";
import Notice from "../../_components/ui/Notice";
import { SelectField, TextField, TextareaField } from "../../_components/ui/Field";
import { useToast } from "../../_components/feedback/ToastProvider";
import { useConfirm } from "../../_components/feedback/ConfirmProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";
import { TYPE } from "@/lib/admin/typeScale";
import { MERGE_FIELDS } from "@/lib/comms/merge";

/**
 * Write an email and see it (specs/comms-v3-composer.md). Left: who it goes
 * to, the message, and the checks. Right: the exact email one real person on
 * the list will get, built by the same renderer the worker sends with. Step
 * through people, including the awkward ones, before anything leaves.
 *
 * The draft saves itself. Sending only queues: the every-minute worker does
 * the sending, inside the daily cap.
 */

type ListOption = { id: string; name: string };
type Only = "all" | "no_first_name" | "never_gave";
type Preview = {
  list: { name: string | null; recipients: number; no_first_name: number; never_gave: number };
  pool: number;
  index: number;
  person: { name: string; email: string } | null;
  from: { name: string; email: string | null } | null;
  subject: string;
  html: string;
  blockers: string[];
  notes: string[];
};

const SUBJECT_ID = "composer-subject";
const BODY_ID = "composer-body";
const TEST_KEY = "bloomos.comms.testEmail";

export default function Composer({
  campaignId,
  initial,
  lists,
  canSend,
}: {
  campaignId: string | null;
  initial: { subject: string; body: string; segmentId: string | null };
  lists: ListOption[];
  canSend: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [id, setId] = useState<string | null>(campaignId);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [segmentId, setSegmentId] = useState(initial.segmentId ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(campaignId ? "saved" : "idle");

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [index, setIndex] = useState(0);
  const [only, setOnly] = useState<Only>("all");
  const [width, setWidth] = useState<"desktop" | "phone">("desktop");

  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState<"" | "test" | "send">("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const lastFocus = useRef<typeof SUBJECT_ID | typeof BODY_ID>(BODY_ID);
  const idRef = useRef<string | null>(campaignId);
  const saved = useRef({ subject: initial.subject, body: initial.body, segmentId: initial.segmentId ?? "" });
  const saving = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    try {
      setTestEmail(window.localStorage.getItem(TEST_KEY) ?? "");
    } catch {
      /* private mode: start empty */
    }
  }, []);

  // ── Saving ────────────────────────────────────────────────────────────
  // One save at a time. Returns the draft's id, or null when there is not
  // enough to save yet (a draft needs a subject and a message) or it failed.
  const saveNow = useCallback(async (): Promise<string | null> => {
    if (saving.current) await saving.current;
    const snap = { subject: subject.trim(), body, segmentId };
    if (!snap.subject || !snap.body.trim()) return idRef.current;
    const same =
      idRef.current && snap.subject === saved.current.subject.trim() && snap.body === saved.current.body && snap.segmentId === saved.current.segmentId;
    if (same) return idRef.current;

    const run = (async () => {
      setSaveState("saving");
      try {
        const existing = idRef.current;
        const res = await fetch(existing ? `/api/admin/comms/${existing}` : "/api/admin/comms", {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            existing
              ? { subject: snap.subject, body: snap.body, segment_id: snap.segmentId || null }
              : { name: snap.subject.slice(0, 120), subject: snap.subject, body: snap.body, segment_id: snap.segmentId || undefined }
          ),
        });
        const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!res.ok) {
          setSaveState("error");
          toast.error(userMessage(res, j));
          return null;
        }
        if (!existing && j.id) {
          idRef.current = j.id;
          setId(j.id);
          // The address bar is left alone on purpose: changing it through
          // the history API makes the Next router remount this screen and
          // throw away what was typed since. The draft is listed under Emails.
        }
        saved.current = { subject: snap.subject, body: snap.body, segmentId: snap.segmentId };
        setSaveState("saved");
        return idRef.current;
      } catch {
        setSaveState("error");
        toast.error(networkMessage());
        return null;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = run;
    return run;
  }, [subject, body, segmentId, toast]);

  // Autosave 1.2 s after the last change.
  useEffect(() => {
    const t = setTimeout(() => void saveNow(), 1200);
    return () => clearTimeout(t);
  }, [saveNow]);

  // ── Preview ───────────────────────────────────────────────────────────
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    setPreviewing(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/comms/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, body, segment_id: segmentId || null, index, only }),
        });
        const j = (await res.json()) as Preview;
        if (n === seq.current && res.ok) setPreview(j);
      } catch {
        /* keep the last good preview */
      } finally {
        if (n === seq.current) setPreviewing(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [subject, body, segmentId, index, only]);

  // ── Merge fields ──────────────────────────────────────────────────────
  const insert = (token: string) => {
    const target = lastFocus.current;
    const el = document.getElementById(target) as HTMLInputElement | HTMLTextAreaElement | null;
    const value = target === SUBJECT_ID ? subject : body;
    const startAt = el?.selectionStart ?? value.length;
    const endAt = el?.selectionEnd ?? value.length;
    const next = value.slice(0, startAt) + token + value.slice(endAt);
    if (target === SUBJECT_ID) setSubject(next);
    else setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(startAt + token.length, startAt + token.length);
    });
  };

  // ── Test and send ─────────────────────────────────────────────────────
  const sendTest = async () => {
    const email = testEmail.trim();
    if (!email) return;
    setBusy("test");
    try {
      const draftId = await saveNow();
      if (!draftId) {
        toast.error("Add a subject and a message first.");
        return;
      }
      const res = await fetch(`/api/admin/comms/${draftId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, index: preview?.index ?? index, only }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        try {
          window.localStorage.setItem(TEST_KEY, email);
        } catch {
          /* fine */
        }
        toast.success(`Test sent to ${email}. It shows the email as ${preview?.person?.name ?? "a real person on the list"} would get it.`);
      } else toast.error(userMessage(res, j));
    } catch {
      toast.error(networkMessage());
    } finally {
      setBusy("");
    }
  };

  const send = async (when: Date | null) => {
    // What goes out is the saved draft, so it must be what is on screen.
    if (!subject.trim() || !body.trim()) {
      toast.error("Add a subject and a message first.");
      return;
    }
    setBusy("send");
    try {
      const draftId = await saveNow();
      if (!draftId) return;
      if (subject.trim() !== saved.current.subject.trim() || body !== saved.current.body || segmentId !== saved.current.segmentId) {
        toast.error("Your latest changes didn't save. Nothing was sent. Try again in a moment.");
        return;
      }
      const pre = await fetch(`/api/admin/comms/${draftId}/send`, { method: "GET" });
      const pj = (await pre.json().catch(() => ({}))) as { recipients?: number; error?: string };
      if (!pre.ok) {
        toast.error(userMessage(pre, pj));
        return;
      }
      const n = pj.recipients ?? 0;
      const people = `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;
      const fromLine = preview?.from?.email ? ` from ${preview.from.email}` : "";
      setBusy("");
      const ok = await confirm({
        title: when
          ? `Schedule this email to ${people} for ${when.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}?`
          : `Send this email to ${people}${fromLine}?`,
        body:
          (when
            ? "It emails real people at that time. You can cancel it until then. "
            : "It starts emailing real people within a minute, one email each. You can cancel the part that hasn't gone yet. ") +
          (preview?.notes.join(" ") ?? ""),
        confirmLabel: when ? `Schedule for ${people}` : `Send to ${people}`,
        destructive: true,
      });
      if (!ok) return;
      setBusy("send");
      const res = await fetch(`/api/admin/comms/${draftId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(when ? { scheduled_at: when.toISOString() } : {}),
      });
      const j = (await res.json().catch(() => ({}))) as { queued?: number; note?: string; error?: string };
      if (!res.ok) {
        toast.error(userMessage(res, j));
        return;
      }
      const head = when ? `Scheduled for ${j.queued} people.` : `On its way to ${j.queued} people. Sending starts within a minute.`;
      toast.success(j.note ? `${head} ${j.note}` : head);
      router.push(`/admin/comms/emails/${draftId}`);
      router.refresh();
    } catch {
      toast.error(networkMessage());
    } finally {
      setBusy("");
    }
  };

  // Off to the list builder and back. The draft is saved first, and the
  // builder is told which email to return to with the list attached.
  const goToLists = async (listId: string | null) => {
    const typed = !!(subject.trim() || body.trim());
    const draftId = (await saveNow()) ?? idRef.current;
    const persisted = !!draftId && subject.trim() === saved.current.subject.trim() && body === saved.current.body;
    if (typed && !persisted) {
      // A draft needs both a subject and a message to be saved. Leaving now
      // would throw away what is on screen.
      toast.error(
        subject.trim() && body.trim()
          ? "Your email didn't save, so nothing was opened. Try again in a moment."
          : "Add a subject and a message first, so your email is saved while you build the list."
      );
      return;
    }
    const back = draftId ?? "new";
    router.push(listId ? `/admin/comms/lists/${listId}?email=${back}` : `/admin/comms/lists/new?email=${back}`);
  };

  const blockers = preview?.blockers ?? [];
  const ready = !!preview && blockers.length === 0;
  const pool = preview?.pool ?? 0;
  const listCount = preview?.list.recipients ?? 0;
  const onlyOptions = [
    { value: "all", label: `Everyone on the list (${listCount.toLocaleString("en-US")})` },
    { value: "no_first_name", label: `No first name (${(preview?.list.no_first_name ?? 0).toLocaleString("en-US")})` },
    { value: "never_gave", label: `Never gave (${(preview?.list.never_gave ?? 0).toLocaleString("en-US")})` },
  ];
  const unsavable = !subject.trim() || !body.trim();
  const saveLabel =
    unsavable ? "Not saved: needs a subject and a message" : saveState === "saving" ? "Saving" : saveState === "saved" ? "Draft saved" : saveState === "error" ? "Not saved. It will try again." : "Not saved yet";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
      {/* ── Left: who, what, check ── */}
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className={`${TYPE.cardTitle} mb-3`}>1. Who it goes to</h2>
          {lists.length === 0 ? (
            <Notice tone="info" title="You don't have a list yet.">
              A list is who this email goes to: all your donors, everyone, or a few people you pick. Build one now and you come straight back here.
              <div className="mt-2">
                <Button onClick={() => void goToLists(null)}>Build your first list</Button>
              </div>
            </Notice>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <SelectField
                  label="List"
                  className="flex-1 min-w-[14rem]"
                  placeholder="Choose a list"
                  options={lists.map((l) => ({ value: l.id, label: l.name }))}
                  value={segmentId}
                  onChange={(e) => {
                    setSegmentId(e.target.value);
                    setIndex(0);
                    setOnly("all");
                  }}
                />
                <Button size="lg" variant="secondary" onClick={() => void goToLists(null)}>
                  New list
                </Button>
              </div>
              <p className={`${TYPE.metadata} mt-2`}>
                {segmentId && preview?.list.name
                  ? `${listCount.toLocaleString("en-US")} ${listCount === 1 ? "person" : "people"} would get this. `
                  : "A list is who this email goes to. Pick one, or make a new one and come straight back. "}
                {segmentId ? (
                  <button type="button" onClick={() => void goToLists(segmentId)} className="font-semibold text-orange">
                    See or change who is on it
                  </button>
                ) : null}
              </p>
            </>
          )}
        </Card>

        <Card>
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className={TYPE.cardTitle}>2. The message</h2>
            <span className={TYPE.metadata} aria-live="polite">{saveLabel}</span>
          </div>
          <TextField
            id={SUBJECT_ID}
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onFocus={() => (lastFocus.current = SUBJECT_ID)}
            maxLength={200}
            placeholder="A quick thank you"
          />
          <div className="mt-3">
            <p className={`${TYPE.fieldLabel} mb-1.5`}>Add a personal detail</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Merge fields">
              {MERGE_FIELDS.map((f) => (
                <Button key={f.key} size="sm" variant="secondary" onClick={() => insert(f.insert)} title={`Inserts ${f.insert}`}>
                  {f.label}
                </Button>
              ))}
            </div>
            <p className={`${TYPE.metadata} mt-1.5`}>
              Each one is filled in per person. The word after the bar is what people without one see: {"{{first_name|there}}"} becomes &ldquo;Ana&rdquo;, or &ldquo;there&rdquo;.
            </p>
          </div>
          <TextareaField
            id={BODY_ID}
            className="mt-3"
            label="Message"
            hint="Plain text, like an email you would write yourself. A blank line starts a new paragraph. Links become clickable."
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => (lastFocus.current = BODY_ID)}
            placeholder={"Hi {{first_name|there}},\n\nThank you for believing in our teens."}
          />
        </Card>

        <Card tone={ready ? "default" : "attention"}>
          <h2 className={`${TYPE.cardTitle} mb-3`}>3. Check and send</h2>
          {blockers.length > 0 ? (
            <Notice tone="warning" title={blockers.length === 1 ? "One thing to fix before this can go:" : `${blockers.length} things to fix before this can go:`}>
              <ul className="list-disc pl-5 space-y-1">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Notice>
          ) : preview ? (
            <Notice tone="success" title={`Ready for ${listCount.toLocaleString("en-US")} ${listCount === 1 ? "person" : "people"}.`}>
              Look through a few people on the right, send yourself a test, then send.
            </Notice>
          ) : null}
          {preview && preview.notes.length > 0 && (
            <ul className={`mt-3 list-disc pl-5 space-y-1 ${TYPE.bodyMuted}`}>
              {preview.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-end gap-2">
            <TextField
              label="Send a test to"
              type="email"
              className="flex-1 min-w-[14rem]"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@yourorg.org"
              hint="Arrives marked [TEST], written as the person in the preview would get it."
            />
          </div>
          <div className="mt-2">
            <Button variant="secondary" size="lg" loading={busy === "test"} disabled={!testEmail.trim() || !subject.trim() || !body.trim() || busy !== ""} onClick={() => void sendTest()}>
              Send test
            </Button>
          </div>

          <div className="mt-4 pt-4 border-t border-hairline flex flex-wrap items-center gap-2">
            {canSend ? (
              <>
                <Button size="lg" loading={busy === "send" && !scheduling} disabled={!ready || busy !== ""} onClick={() => void send(null)}>
                  {listCount > 0 ? `Send to ${listCount.toLocaleString("en-US")} ${listCount === 1 ? "person" : "people"}` : "Send"}
                </Button>
                {!scheduling ? (
                  <Button size="lg" variant="secondary" disabled={!ready || busy !== ""} onClick={() => setScheduling(true)}>
                    Send later
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <TextField label="Send at" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                    <Button size="lg" variant="secondary" disabled={!ready || !scheduleAt || busy !== ""} onClick={() => void send(new Date(scheduleAt))}>
                      Schedule
                    </Button>
                    <Button size="lg" variant="quiet" onClick={() => setScheduling(false)}>
                      Not now
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className={TYPE.bodyMuted}>Your role can write and test emails. Someone who can send will take it from here.</p>
            )}
          </div>
        </Card>
      </div>

      {/* ── Right: the email as one person gets it ── */}
      <Card padded={false} className="xl:sticky xl:top-4">
        <div className="p-4 border-b border-hairline">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={TYPE.cardTitle}>
              Preview{previewing ? <span className={`${TYPE.metadata} ml-2 font-normal`}>updating</span> : null}
            </h2>
            <div className="flex items-center gap-1" role="group" aria-label="Preview width">
              <Button size="sm" variant={width === "desktop" ? "secondary" : "quiet"} aria-pressed={width === "desktop"} onClick={() => setWidth("desktop")}>
                Computer
              </Button>
              <Button size="sm" variant={width === "phone" ? "secondary" : "quiet"} aria-pressed={width === "phone"} onClick={() => setWidth("phone")}>
                Phone
              </Button>
            </div>
          </div>
          {segmentId && preview && listCount > 0 ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <SelectField
                label="Show me"
                controlSize="md"
                className="flex-1 min-w-[12rem]"
                options={onlyOptions}
                value={only}
                onChange={(e) => {
                  setOnly(e.target.value as Only);
                  setIndex(0);
                }}
              />
              <div className="flex items-center gap-2">
                <Button size="md" variant="secondary" disabled={index <= 0} onClick={() => setIndex(index - 1)} aria-label="Previous person">
                  Previous
                </Button>
                <span className={`${TYPE.metadata} [font-variant-numeric:tabular-nums] whitespace-nowrap`}>
                  {pool === 0 ? "0 of 0" : `${(preview.index + 1).toLocaleString("en-US")} of ${pool.toLocaleString("en-US")}`}
                </span>
                <Button size="md" variant="secondary" disabled={index >= pool - 1} onClick={() => setIndex(index + 1)} aria-label="Next person">
                  Next
                </Button>
              </div>
            </div>
          ) : (
            <p className={`${TYPE.metadata} mt-2`}>Choose a list to see this email as each real person will get it. Until then, it shows your fallback words.</p>
          )}
        </div>

        <dl className="px-4 py-3 border-b border-hairline grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt className={TYPE.metadata}>From</dt>
          <dd className={`${TYPE.body} truncate`}>
            {preview?.from ? `${preview.from.name}${preview.from.email ? ` <${preview.from.email}>` : ""}` : "Set up your sender on the Emails page"}
          </dd>
          <dt className={TYPE.metadata}>To</dt>
          <dd className={`${TYPE.body} truncate`}>
            {preview?.person ? (preview.person.name === preview.person.email ? preview.person.email : `${preview.person.name} <${preview.person.email}>`) : only !== "all" && segmentId ? "No one on this list fits that" : "Someone on your list"}
          </dd>
          <dt className={TYPE.metadata}>Subject</dt>
          <dd className={`${TYPE.body} font-semibold break-words`}>{preview?.subject || "Your subject"}</dd>
        </dl>

        <div className="bg-tile p-3">
          <iframe
            title="The email as this person will get it"
            sandbox=""
            srcDoc={`<!doctype html><html><body style="margin:0;background:#ffffff;">${preview?.html ?? ""}</body></html>`}
            className={`block mx-auto h-[520px] rounded-control border border-hairline bg-white ${width === "phone" ? "w-[375px] max-w-full" : "w-full"}`}
          />
        </div>
        <p className={`${TYPE.metadata} px-4 pb-3`}>
          {id ? "This draft is saved under Emails. You can leave and come back to it." : "The draft saves itself once it has a subject and a message."}
        </p>
      </Card>
    </div>
  );
}
