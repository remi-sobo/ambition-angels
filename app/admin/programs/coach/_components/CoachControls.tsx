"use client";

// Client pieces of BloomOS → Programs → Coach: person rows (status, staff
// note, private link actions), the new-match form, and match rows (status,
// intro, sessions, plan).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";
import {
  MATCH_STATUSES,
  MATCH_STATUS_LABELS,
  PERSON_STATUSES,
  PERSON_STATUS_LABELS,
  type AmbitionPlan,
  type MatchStatus,
  type PersonStatus,
} from "@/lib/coach/program";

export type PersonView = {
  id: string;
  kind: "coach" | "student";
  name: string;
  email: string;
  phone: string | null;
  field: string;
  detail: string;
  linkedin: string | null;
  goal: string | null;
  timing: string | null;
  referral: string | null;
  note: string | null;
  staff_note: string | null;
  status: PersonStatus;
  created_at: string;
  link_sent_at: string | null;
  last_seen_at: string | null;
  url: string;
};

export type MatchView = {
  id: string;
  status: MatchStatus;
  coach: { id: string; name: string; detail: string; url: string };
  student: { id: string; name: string; detail: string; url: string };
  field: string;
  intro_sent_at: string | null;
  sessions: { n: number; scheduled_on: string | null; done_at: string | null; student_note: string | null; coach_note: string | null }[];
  plan: AmbitionPlan;
  planFilled: number;
  planTotal: number;
  plan_updated_at: string | null;
  plan_shared_at: string | null;
  coach_reaction: string | null;
  created_at: string;
};

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

function useApi() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const call = async (url: string, body: unknown, success?: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(userMessage(res, j));
        return false;
      }
      if (success) toast.success(success);
      router.refresh();
      return true;
    } catch {
      toast.error(networkMessage());
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, call };
}

function Btn({
  children,
  onClick,
  disabled,
  tone = "neutral",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "neutral" | "danger";
}) {
  const cls =
    tone === "primary"
      ? "bg-orange/15 text-orange hover:bg-orange/25 font-semibold"
      : tone === "danger"
      ? "text-ink-2 hover:text-expense"
      : "bg-tile text-ink-2 hover:text-ink-1";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`px-2.5 py-1 rounded-control text-xs disabled:opacity-50 ${cls}`}>
      {children}
    </button>
  );
}

function CopyLink({ url, label = "Copy link" }: { url: string; label?: string }) {
  const toast = useToast();
  return (
    <Btn
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Private link copied.");
        } catch {
          toast.info(url);
        }
      }}
    >
      {label}
    </Btn>
  );
}

const selectCls = "text-xs bg-tile rounded-control px-2 py-1 text-ink-1 border-hairline";

export function PersonRow({ p }: { p: PersonView }) {
  const { busy, call } = useApi();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(p.staff_note ?? "");
  const url = `/api/admin/coach/people/${p.id}`;

  return (
    <div className="bg-surface border-hairline rounded-panel">
      <div className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-left min-w-0 flex-1" aria-expanded={open}>
          <div className="text-sm font-semibold text-ink-1">{p.name}</div>
          <div className="text-xs text-ink-2 truncate">
            {p.field}
            {p.detail ? ` · ${p.detail}` : ""}
          </div>
        </button>
        <span className="text-xs text-ink-2 tabular-nums">
          {p.last_seen_at ? `Opened page ${fmt(p.last_seen_at)}` : p.link_sent_at ? `Link sent ${fmt(p.link_sent_at)}` : `Signed up ${fmt(p.created_at)}`}
        </span>
        <select
          aria-label={`Status for ${p.name}`}
          value={p.status}
          disabled={busy}
          onChange={(e) => call(url, { action: "update", status: e.target.value })}
          className={selectCls}
        >
          {PERSON_STATUSES.map((s) => (
            <option key={s} value={s}>{PERSON_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-hairline space-y-3 text-sm text-ink-1">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs pt-2">
            <div><dt className="inline text-ink-2">Email </dt><dd className="inline select-all">{p.email}</dd></div>
            {p.phone && <div><dt className="inline text-ink-2">Phone </dt><dd className="inline select-all">{p.phone}</dd></div>}
            {p.linkedin && (
              <div>
                <dt className="inline text-ink-2">LinkedIn </dt>
                <dd className="inline">
                  <a className="text-orange hover:underline" target="_blank" rel="noreferrer" href={p.linkedin.startsWith("http") ? p.linkedin : `https://${p.linkedin}`}>
                    {p.linkedin.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                </dd>
              </div>
            )}
            {p.timing && <div><dt className="inline text-ink-2">Timing </dt><dd className="inline">{p.timing}</dd></div>}
            {p.referral && <div><dt className="inline text-ink-2">Heard from </dt><dd className="inline">{p.referral}</dd></div>}
          </dl>
          {p.goal && <p className="text-xs"><span className="text-ink-2">Goal: </span>{p.goal}</p>}
          {p.note && <p className="text-xs"><span className="text-ink-2">Their note: </span>{p.note}</p>}
          <div>
            <label htmlFor={`sn-${p.id}`} className="block text-xs text-ink-2 mb-1">Staff note (only AA sees this)</label>
            <textarea
              id={`sn-${p.id}`}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                if (note !== (p.staff_note ?? "")) call(url, { action: "update", staff_note: note });
              }}
              className="w-full text-sm bg-tile rounded-control px-2.5 py-2 border-hairline"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={p.url} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-control text-xs bg-tile text-ink-2 hover:text-ink-1">
              Open their page ↗
            </a>
            <CopyLink url={p.url} />
            <Btn disabled={busy} onClick={() => call(url, { action: "send_link" }, `Link sent to ${p.email}.`)}>
              Email link
            </Btn>
            <Btn
              tone="danger"
              disabled={busy}
              onClick={async () => {
                const ok = await confirm({
                  title: `Reset ${p.name}'s link?`,
                  body: "Their old link stops working right away. A new one goes to their email.",
                  confirmLabel: "Reset and send",
                  destructive: true,
                });
                if (ok) call(url, { action: "reset_link" }, `New link sent to ${p.email}.`);
              }}
            >
              Reset link
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

export function NewMatchForm({
  coaches,
  students,
}: {
  coaches: { id: string; label: string }[];
  students: { id: string; label: string }[];
}) {
  const { busy, call } = useApi();
  const [coach, setCoach] = useState("");
  const [student, setStudent] = useState("");
  if (coaches.length === 0 || students.length === 0) {
    return (
      <p className="text-xs text-ink-2">
        Matching opens once there&apos;s at least one unmatched coach and one unmatched student.
      </p>
    );
  }
  return (
    <div className="bg-surface border-hairline rounded-panel px-3 py-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-ink-1">New match</span>
      <select aria-label="Student" value={student} onChange={(e) => setStudent(e.target.value)} className={selectCls + " max-w-full"}>
        <option value="">Pick a student</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
      <span className="text-xs text-ink-2">with</span>
      <select aria-label="Coach" value={coach} onChange={(e) => setCoach(e.target.value)} className={selectCls + " max-w-full"}>
        <option value="">Pick a coach</option>
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>{c.label}</option>
        ))}
      </select>
      <Btn
        tone="primary"
        disabled={busy || !coach || !student}
        onClick={async () => {
          if (await call("/api/admin/coach/matches", { coach_id: coach, student_id: student }, "Match created. Send the intro when you're ready.")) {
            setCoach("");
            setStudent("");
          }
        }}
      >
        Create match
      </Btn>
    </div>
  );
}

const PLAN_ROWS: [keyof Omit<AmbitionPlan, "moves">, string][] = [
  ["career", "Career"],
  ["why", "Why"],
  ["learned", "What they learned"],
  ["needs", "Still needs"],
  ["changing", "How it's changing"],
];

export function MatchRow({ m }: { m: MatchView }) {
  const { busy, call } = useApi();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const url = `/api/admin/coach/matches/${m.id}`;
  const done = m.sessions.filter((s) => s.done_at).length;

  return (
    <div className="bg-surface border-hairline rounded-panel">
      <div className="px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-left min-w-0 flex-1" aria-expanded={open}>
          <div className="text-sm font-semibold text-ink-1">
            {m.student.name} <span className="text-ink-2 font-normal">with</span> {m.coach.name}
          </div>
          <div className="text-xs text-ink-2 truncate">
            {m.field}
            {m.coach.detail ? ` · ${m.coach.detail}` : ""}
          </div>
        </button>
        <div className="flex items-center gap-1" role="img" aria-label={`${done} of 4 sessions done`}>
          {m.sessions.map((s) => (
            <span key={s.n} className={`w-5 h-1.5 rounded-full ${s.done_at ? "bg-orange" : "bg-tile"}`} />
          ))}
        </div>
        <span className="text-xs text-ink-2 tabular-nums">
          Plan {m.planFilled}/{m.planTotal}
          {m.plan_shared_at ? " · ready" : ""}
        </span>
        <select
          aria-label="Match status"
          value={m.status}
          disabled={busy}
          onChange={(e) => call(url, { action: "status", status: e.target.value })}
          className={selectCls}
        >
          {MATCH_STATUSES.map((s) => (
            <option key={s} value={s}>{MATCH_STATUS_LABELS[s]}</option>
          ))}
        </select>
        {m.status === "proposed" && (
          <Btn
            tone="primary"
            disabled={busy}
            onClick={async () => {
              const ok = await confirm({
                title: `Send the intro to ${m.student.name} and ${m.coach.name}?`,
                body: "One email to both of them with you cc'd, then each gets their private page link. The match shows up on their pages.",
                confirmLabel: "Send intro",
              });
              if (ok) call(url, { action: "send_intro" }, "Intro sent.");
            }}
          >
            Send intro
          </Btn>
        )}
      </div>

      {open && (
        <div className="px-3 pb-3 pt-2 border-t border-hairline grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm text-ink-1">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-ink-2">Sessions</div>
            {m.sessions.map((s) => (
              <div key={s.n} className="text-xs">
                <span className="font-semibold">Session {s.n}</span>{" "}
                <span className="text-ink-2">
                  {s.done_at ? `done ${fmt(s.done_at)}` : s.scheduled_on ? `set for ${fmt(s.scheduled_on)}` : "not set"}
                </span>
                {s.student_note && <p className="mt-0.5"><span className="text-ink-2">Student: </span>{s.student_note}</p>}
                {s.coach_note && <p className="mt-0.5"><span className="text-ink-2">Coach: </span>{s.coach_note}</p>}
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-2">
              <a href={m.student.url} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-control text-xs bg-tile text-ink-2 hover:text-ink-1">
                Student page ↗
              </a>
              <a href={m.coach.url} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-control text-xs bg-tile text-ink-2 hover:text-ink-1">
                Coach page ↗
              </a>
              {m.status !== "proposed" && (
                <Btn disabled={busy} onClick={() => call(url, { action: "send_intro" }, "Intro resent.")}>
                  Resend intro
                </Btn>
              )}
              <Btn
                tone="danger"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Delete this match?",
                    body: "The sessions, notes and the student's plan for this match are deleted too. To keep them, set the status to Ended early instead.",
                    confirmLabel: "Delete match",
                    destructive: true,
                  });
                  if (ok) call(url, { action: "delete" }, "Match deleted.");
                }}
              >
                Delete
              </Btn>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-ink-2">
              Ambition Plan{m.plan_updated_at ? ` · updated ${fmt(m.plan_updated_at)}` : ""}
            </div>
            {PLAN_ROWS.map(([k, label]) => (
              <p key={k} className="text-xs">
                <span className="text-ink-2">{label}: </span>
                {m.plan[k] || <span className="text-ink-3">not yet</span>}
              </p>
            ))}
            <div className="text-xs">
              <span className="text-ink-2">Moves:</span>
              <ol className="list-decimal pl-5">
                {m.plan.moves.map((mv, i) => (
                  <li key={i}>
                    {mv.action || <span className="text-ink-3">not yet</span>}
                    {mv.due ? <span className="text-ink-2"> · by {fmt(mv.due)}</span> : null}
                  </li>
                ))}
              </ol>
            </div>
            {m.coach_reaction && (
              <p className="text-xs"><span className="text-ink-2">Coach reaction: </span>{m.coach_reaction}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
