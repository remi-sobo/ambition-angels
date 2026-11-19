"use client";

import { useEffect, useRef, useState } from "react";
import { SESSIONS, planProgress, type AmbitionPlan, type MatchStatus } from "@/lib/coach/program";

export type SpaceSession = {
  n: number;
  scheduled_on: string | null;
  done_at: string | null;
  student_note: string | null;
  coach_note: string | null;
};

export type SpaceMatch = {
  id: string;
  status: MatchStatus;
  plan: AmbitionPlan;
  plan_updated_at: string | null;
  plan_shared_at: string | null;
  coach_reaction: string | null;
  coach_reaction_at: string | null;
  other: {
    first_name: string;
    last_name: string;
    email: string;
    field: string;
    role: string | null;
    company: string | null;
    linkedin: string | null;
    school: string | null;
    program: string | null;
    goal: string | null;
    age: number | null;
  };
  sessions: SpaceSession[];
};

type Kind = "coach" | "student";
type SaveState = "idle" | "saving" | "saved" | "error";

const dotTexture = {
  backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

const card = "bg-white border border-gray-light rounded-card-lg p-6 sm:p-8";
const eyebrow = "text-xs font-heading font-semibold text-orange uppercase tracking-widest mb-3";
const fieldCls =
  "w-full border border-gray-mid/60 rounded-card bg-cream px-4 py-3 text-ink text-[15px] leading-relaxed placeholder:text-gray-warm/70 focus:outline-none focus:border-orange focus-visible:ring-2 focus-visible:ring-orange/30 transition-colors";
const labelCls = "block font-heading font-semibold text-ink text-sm mb-1";
const hintCls = "text-gray-warm text-sm mb-2";

function useSaver(token: string) {
  const [state, setState] = useState<SaveState>("idle");
  const save = async (payload: Record<string, unknown>) => {
    setState("saving");
    try {
      const res = await fetch(`/api/coach/me/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      setState("saved");
      return true;
    } catch {
      setState("error");
      return false;
    }
  };
  return { state, save };
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const text = state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Didn't save. Check your connection.";
  return (
    <span className={`text-xs font-semibold ${state === "error" ? "text-orange-dark" : "text-gray-warm"}`} aria-live="polite">
      {text}
    </span>
  );
}

const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function CoachSpace({
  token,
  kind,
  firstName,
  field,
  matches,
  pending,
}: {
  token: string;
  kind: Kind;
  firstName: string;
  field: string;
  matches: SpaceMatch[];
  pending: boolean;
}) {
  const [active, setActive] = useState(0);
  const m = matches[active];

  return (
    <>
      <section className="bg-ink relative overflow-hidden" style={dotTexture}>
        <div className="container-site relative z-10 pt-32 pb-12 sm:pt-36 sm:pb-16">
          <div className="inline-block text-xs font-heading font-semibold text-orange bg-orange/10 border border-orange/30 px-4 py-1.5 rounded-full uppercase tracking-widest mb-5">
            Ambition Coach
          </div>
          <h1 className="font-display font-black text-5xl sm:text-6xl text-cream uppercase leading-[0.95] tracking-tight mb-4">
            Hi {firstName}.
          </h1>
          <p className="text-gray-mid text-lg leading-relaxed max-w-2xl">
            {m
              ? kind === "student"
                ? `This is your page for the program with ${m.other.first_name}. Prep for each session is here, and your Ambition Plan saves as you type.`
                : `This is your page for coaching ${m.other.first_name}. Prep for each session is here, and you can read their plan as it comes together.`
              : kind === "student"
              ? `We're finding you a coach in ${field.toLowerCase()}. Your coach and everything for the program will show up right here.`
              : `Thank you for raising your hand. When there's a student heading into ${field.toLowerCase()}, Remi will reach out first. Once you're matched, everything shows up here.`}
          </p>
          {matches.length > 1 && (
            <div className="flex flex-wrap gap-2 mt-8" role="tablist" aria-label="Your students">
              {matches.map((x, i) => (
                <button
                  key={x.id}
                  role="tab"
                  aria-selected={i === active}
                  onClick={() => setActive(i)}
                  className={`px-5 py-2.5 rounded-full text-sm font-heading font-semibold min-h-[44px] transition-colors ${
                    i === active ? "bg-orange text-white" : "bg-cream/5 text-cream border border-cream/20 hover:bg-cream/10"
                  }`}
                >
                  {x.other.first_name} {x.other.last_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-cream py-10 sm:py-14">
        <div className="container-site space-y-8">
          {m ? (
            <MatchView key={m.id} token={token} kind={kind} m={m} />
          ) : (
            <Waiting kind={kind} pending={pending} />
          )}
          <p className="text-gray-warm text-sm text-center leading-relaxed">
            This page is just for you, so please don&apos;t share the link. Questions? Email{" "}
            <span className="select-all text-charcoal font-semibold">remi@ambitionangels.org</span>
          </p>
        </div>
      </section>
    </>
  );
}

function Waiting({ kind, pending }: { kind: Kind; pending: boolean }) {
  return (
    <div className="space-y-8">
      <div className={card}>
        <div className={eyebrow}>What happens next</div>
        <h2 className="font-heading font-bold text-2xl text-ink mb-3">
          {pending ? "Your match is being set up." : kind === "student" ? "We're looking for your coach." : "We'll be in touch."}
        </h2>
        <p className="text-charcoal leading-relaxed max-w-2xl">
          {kind === "student"
            ? "Remi will email you and your coach together. When that intro lands, reply all with a few times for session 1. That's your move. Here's what the four sessions look like."
            : "Remi will call you first and send a student's profile before anything is set. You say yes or no. Here's what the four sessions look like."}
        </p>
      </div>
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {SESSIONS.map((s) => (
          <li key={s.n} className="bg-white border border-gray-light rounded-card p-5">
            <div className="font-display font-black text-4xl text-orange leading-none mb-3">{s.n}</div>
            <h3 className="font-heading font-semibold text-ink mb-1">{s.name}</h3>
            <p className="text-charcoal text-sm leading-relaxed">{s.goal}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MatchView({ token, kind, m }: { token: string; kind: Kind; m: SpaceMatch }) {
  const [sessions, setSessions] = useState(m.sessions);
  const doneCount = sessions.filter((s) => s.done_at).length;
  const nextN = sessions.find((s) => !s.done_at)?.n ?? null;
  const o = m.other;
  const otherLine =
    kind === "student"
      ? [o.role, o.company].filter(Boolean).join(" at ")
      : [o.age ? `${o.age}` : null, o.school, o.program].filter(Boolean).join(" · ");

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <div className={card}>
          <div className={eyebrow}>{kind === "student" ? "Your coach" : "Your student"}</div>
          <h2 className="font-heading font-bold text-2xl sm:text-3xl text-ink mb-1">
            {o.first_name} {o.last_name}
          </h2>
          {otherLine && <p className="text-charcoal mb-1">{otherLine}</p>}
          <p className="text-gray-warm text-sm mb-4">
            {kind === "student" ? `Works in ${o.field.toLowerCase()}` : `Heading into ${o.field.toLowerCase()}`}
          </p>
          {kind === "coach" && o.goal && (
            <blockquote className="border-l-2 border-orange pl-4 text-charcoal italic leading-relaxed mb-4">
              {o.goal}
            </blockquote>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="text-charcoal">
              Email: <span className="select-all font-semibold text-ink">{o.email}</span>
            </span>
            {o.linkedin && (
              <a
                href={o.linkedin.startsWith("http") ? o.linkedin : `https://${o.linkedin}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-orange hover:text-orange-dark"
              >
                LinkedIn ↗
              </a>
            )}
          </div>
        </div>
        <div className="bg-ink text-cream rounded-card-lg p-6 sm:p-8" style={dotTexture}>
          <div className={eyebrow}>Progress</div>
          <div className="flex items-end gap-3 mb-5">
            <span className="font-display font-black text-6xl leading-none">{doneCount}</span>
            <span className="text-gray-mid pb-1">of 4 sessions done</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 mb-5" aria-hidden="true">
            {sessions.map((s) => (
              <div key={s.n} className={`h-2 rounded-full ${s.done_at ? "bg-orange" : "bg-cream/15"}`} />
            ))}
          </div>
          <p className="text-gray-mid text-sm leading-relaxed">
            {nextN
              ? kind === "student"
                ? `Up next: session ${nextN}. You own the schedule, so send ${o.first_name} the invite.`
                : `Up next: session ${nextN}. ${o.first_name} will send the invite.`
              : "All four sessions done. Thank you for showing up."}
          </p>
        </div>
      </div>

      <div>
        <h2 className="font-heading font-bold text-2xl text-ink mb-4">The four sessions</h2>
        <ol className="space-y-4">
          {SESSIONS.map((g) => (
            <SessionCard
              key={g.n}
              token={token}
              kind={kind}
              matchId={m.id}
              guide={g}
              session={sessions.find((s) => s.n === g.n)!}
              isNext={g.n === nextN}
              otherFirst={o.first_name}
              onChange={(patch) => setSessions((prev) => prev.map((s) => (s.n === g.n ? { ...s, ...patch } : s)))}
            />
          ))}
        </ol>
      </div>

      {kind === "student" ? <PlanEditor token={token} m={m} /> : <PlanReader token={token} m={m} />}
    </>
  );
}

function SessionCard({
  token,
  kind,
  matchId,
  guide,
  session,
  isNext,
  otherFirst,
  onChange,
}: {
  token: string;
  kind: Kind;
  matchId: string;
  guide: (typeof SESSIONS)[number];
  session: SpaceSession;
  isNext: boolean;
  otherFirst: string;
  onChange: (patch: Partial<SpaceSession>) => void;
}) {
  const { state, save } = useSaver(token);
  const mine = kind === "coach" ? session.coach_note : session.student_note;
  const theirs = kind === "coach" ? session.student_note : session.coach_note;
  const [note, setNote] = useState(mine ?? "");
  const [open, setOpen] = useState(isNext);
  const prep = kind === "coach" ? guide.coachPrep : guide.studentPrep;
  const done = !!session.done_at;

  const send = (payload: Record<string, unknown>) => save({ action: "session", match_id: matchId, n: guide.n, ...payload });

  return (
    <li className={`bg-white border rounded-card-lg ${isNext ? "border-orange" : "border-gray-light"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-4 sm:gap-6 p-5 sm:p-6 text-left"
      >
        <span className={`font-display font-black text-4xl leading-none w-8 ${done ? "text-gray-mid" : "text-orange"}`}>
          {guide.n}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-heading font-semibold text-ink text-lg">{guide.name}</span>
          <span className="block text-charcoal text-sm">{guide.goal}</span>
        </span>
        <span className="shrink-0 text-xs font-heading font-semibold uppercase tracking-widest">
          {done ? (
            <span className="text-gray-warm">Done {fmtDate(session.done_at!)}</span>
          ) : session.scheduled_on ? (
            <span className="text-charcoal">{fmtDate(session.scheduled_on)}</span>
          ) : isNext ? (
            <span className="text-orange">Up next</span>
          ) : null}
        </span>
      </button>

      {open && (
        <div className="px-5 sm:px-6 pb-6 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 border-t border-gray-light pt-5">
          <div>
            <div className="text-xs font-heading font-semibold text-gray-warm uppercase tracking-widest mb-3">
              {kind === "coach" ? "Your prep" : "Before you meet"}
            </div>
            <ol className="space-y-2.5">
              {prep.map((p, i) => (
                <li key={i} className="flex gap-3 text-charcoal leading-relaxed">
                  <span className="font-heading font-semibold text-orange shrink-0">{i + 1}.</span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
            {theirs && (
              <div className="mt-5 bg-cream rounded-card p-4">
                <div className="text-xs font-heading font-semibold text-gray-warm uppercase tracking-widest mb-1">
                  {otherFirst}&apos;s note
                </div>
                <p className="text-charcoal text-sm leading-relaxed whitespace-pre-line">{theirs}</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor={`d-${guide.n}`} className={labelCls}>Date</label>
                <input
                  id={`d-${guide.n}`}
                  type="date"
                  defaultValue={session.scheduled_on ?? ""}
                  onChange={(e) => {
                    onChange({ scheduled_on: e.target.value || null });
                    send({ scheduled_on: e.target.value });
                  }}
                  className={fieldCls + " w-auto min-h-[48px]"}
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  const next = !done;
                  onChange({ done_at: next ? new Date().toISOString() : null });
                  if (!(await send({ done: next }))) onChange({ done_at: session.done_at });
                }}
                className={`min-h-[48px] px-5 rounded-full font-heading font-semibold text-sm transition-colors ${
                  done ? "bg-gray-light text-charcoal hover:bg-gray-mid/50" : "bg-orange text-white hover:bg-orange-dark"
                }`}
              >
                {done ? "Mark not done" : "We met. Mark done"}
              </button>
            </div>
            <div>
              <label htmlFor={`n-${guide.n}`} className={labelCls}>Your note</label>
              <p className={hintCls}>
                {kind === "coach"
                  ? `What you noticed, or what you want ${otherFirst} to work on. They can see this.`
                  : `What you took away. ${otherFirst} can see this.`}
              </p>
              <textarea
                id={`n-${guide.n}`}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => {
                  if (note !== (mine ?? "")) send({ note });
                }}
                className={fieldCls}
              />
            </div>
            <SaveBadge state={state} />
          </div>
        </div>
      )}
    </li>
  );
}

const PLAN_PARTS: { key: keyof Omit<AmbitionPlan, "moves">; label: string; hint: string; rows: number }[] = [
  { key: "career", label: "The career I'm going after", hint: "As specific as you can. A job title is great.", rows: 1 },
  { key: "why", label: "Why this", hint: "Two or three sentences. Write this before session 1.", rows: 3 },
  { key: "learned", label: "What I learned about the work", hint: "The real version, from your coach. After sessions 1 and 2.", rows: 4 },
  { key: "needs", label: "Skills and experience I still need", hint: "And the cheapest real route to each. After sessions 2 and 3.", rows: 4 },
  { key: "changing", label: "How the field is changing", hint: "What's different now, AI included. After session 3.", rows: 3 },
];

function PlanEditor({ token, m }: { token: string; m: SpaceMatch }) {
  const [plan, setPlan] = useState<AmbitionPlan>(m.plan);
  const [ready, setReady] = useState(!!m.plan_shared_at);
  const { state, save } = useSaver(token);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  const { filled, total } = planProgress(plan);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save({ action: "plan", match_id: m.id, plan }), 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const setPart = (key: keyof Omit<AmbitionPlan, "moves">, v: string) => setPlan((p) => ({ ...p, [key]: v }));
  const setMove = (i: number, patch: Partial<AmbitionPlan["moves"][number]>) =>
    setPlan((p) => ({ ...p, moves: p.moves.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  return (
    <div className={card} id="plan">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className={eyebrow}>Your Ambition Plan</div>
          <h2 className="font-heading font-bold text-2xl sm:text-3xl text-ink mb-2">Build it as you go.</h2>
          <p className="text-charcoal leading-relaxed max-w-2xl">
            Add to it after every session. By session 4 you read it back to {m.other.first_name}. It saves as you type,
            and {m.other.first_name} can see it.
          </p>
        </div>
        <div className="text-right">
          <div className="font-display font-black text-4xl text-ink leading-none">
            {filled}/{total}
          </div>
          <div className="text-gray-warm text-xs font-heading font-semibold uppercase tracking-widest mt-1">filled in</div>
        </div>
      </div>

      {m.coach_reaction && (
        <div className="bg-orange-light border border-orange/30 rounded-card p-5 mb-6">
          <div className="text-xs font-heading font-semibold text-orange-dark uppercase tracking-widest mb-1">
            {m.other.first_name}&apos;s reaction
          </div>
          <p className="text-ink leading-relaxed whitespace-pre-line">{m.coach_reaction}</p>
        </div>
      )}

      <div className="space-y-6">
        {PLAN_PARTS.map((p) => (
          <div key={p.key}>
            <label htmlFor={`p-${p.key}`} className={labelCls}>{p.label}</label>
            <p className={hintCls}>{p.hint}</p>
            {p.rows === 1 ? (
              <input id={`p-${p.key}`} value={plan[p.key]} maxLength={200} onChange={(e) => setPart(p.key, e.target.value)} className={fieldCls + " min-h-[48px]"} />
            ) : (
              <textarea id={`p-${p.key}`} rows={p.rows} value={plan[p.key]} maxLength={2000} onChange={(e) => setPart(p.key, e.target.value)} className={fieldCls} />
            )}
          </div>
        ))}

        <fieldset>
          <legend className={labelCls}>My next three moves</legend>
          <p className={hintCls}>Specific actions with real dates in the next 90 days. Finish these for session 4.</p>
          <div className="space-y-3">
            {plan.moves.map((mv, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_170px] gap-3 items-center">
                <span className="font-display font-black text-2xl text-orange w-6">{i + 1}</span>
                <input
                  aria-label={`Move ${i + 1}`}
                  value={mv.action}
                  maxLength={300}
                  onChange={(e) => setMove(i, { action: e.target.value })}
                  placeholder={i === 0 ? "e.g. Apply to the Cisco cybersecurity apprenticeship" : ""}
                  className={fieldCls + " min-h-[48px]"}
                />
                <input
                  aria-label={`Move ${i + 1} date`}
                  type="date"
                  value={mv.due}
                  onChange={(e) => setMove(i, { due: e.target.value })}
                  className={fieldCls + " min-h-[48px] col-start-2 sm:col-start-auto"}
                />
              </div>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center gap-4 mt-8 pt-6 border-t border-gray-light">
        <button
          type="button"
          onClick={async () => {
            const next = !ready;
            setReady(next);
            if (!(await save({ action: "plan_ready", match_id: m.id, ready: next }))) setReady(!next);
          }}
          className={`min-h-[52px] px-7 rounded-full font-heading font-semibold transition-colors ${
            ready ? "bg-gray-light text-charcoal hover:bg-gray-mid/50" : "bg-orange text-white hover:bg-orange-dark"
          }`}
        >
          {ready ? "Marked ready. Undo" : "My plan is ready for session 4"}
        </button>
        <SaveBadge state={state} />
      </div>
    </div>
  );
}

function PlanReader({ token, m }: { token: string; m: SpaceMatch }) {
  const p = m.plan;
  const { filled, total } = planProgress(p);
  const [reaction, setReaction] = useState(m.coach_reaction ?? "");
  const [savedReaction, setSavedReaction] = useState(m.coach_reaction ?? "");
  const { state, save } = useSaver(token);

  return (
    <div className={card} id="plan">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className={eyebrow}>{m.other.first_name}&apos;s Ambition Plan</div>
          <h2 className="font-heading font-bold text-2xl sm:text-3xl text-ink mb-2">
            {m.plan_shared_at ? "Ready for session 4." : "In progress."}
          </h2>
          <p className="text-charcoal leading-relaxed max-w-2xl">
            {m.other.first_name} writes this and adds to it after each session. You react to it. Before session 4,
            read it through and leave your reaction below.
          </p>
        </div>
        <div className="text-right">
          <div className="font-display font-black text-4xl text-ink leading-none">
            {filled}/{total}
          </div>
          <div className="text-gray-warm text-xs font-heading font-semibold uppercase tracking-widest mt-1">filled in</div>
        </div>
      </div>

      <dl className="divide-y divide-gray-light">
        {PLAN_PARTS.map((part) => (
          <div key={part.key} className="py-4 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-1 sm:gap-6">
            <dt className="font-heading font-semibold text-ink text-sm">{part.label}</dt>
            <dd className={`leading-relaxed whitespace-pre-line ${p[part.key] ? "text-charcoal" : "text-gray-warm italic"}`}>
              {p[part.key] || "Not yet"}
            </dd>
          </div>
        ))}
        <div className="py-4 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-1 sm:gap-6">
          <dt className="font-heading font-semibold text-ink text-sm">Next three moves</dt>
          <dd>
            <ol className="space-y-1.5">
              {p.moves.map((mv, i) => (
                <li key={i} className={`flex gap-3 ${mv.action ? "text-charcoal" : "text-gray-warm italic"}`}>
                  <span className="font-heading font-semibold text-orange">{i + 1}.</span>
                  <span className="flex-1">{mv.action || "Not yet"}</span>
                  {mv.due && <span className="text-gray-warm text-sm tabular-nums">by {fmtDate(mv.due)}</span>}
                </li>
              ))}
            </ol>
          </dd>
        </div>
      </dl>

      <div className="mt-6 pt-6 border-t border-gray-light">
        <label htmlFor="reaction" className={labelCls}>Your reaction</label>
        <p className={hintCls}>
          What&apos;s strong, what&apos;s missing, and whether the three moves are real. {m.other.first_name} sees this
          on their page and gets an email when you save.
        </p>
        <textarea id="reaction" rows={4} value={reaction} maxLength={2000} onChange={(e) => setReaction(e.target.value)} className={fieldCls} />
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <button
            type="button"
            disabled={reaction.trim() === savedReaction.trim()}
            onClick={async () => {
              if (await save({ action: "reaction", match_id: m.id, text: reaction })) setSavedReaction(reaction);
            }}
            className="min-h-[48px] px-6 rounded-full bg-orange text-white font-heading font-semibold hover:bg-orange-dark transition-colors disabled:opacity-50"
          >
            Save and let {m.other.first_name} know
          </button>
          <SaveBadge state={state} />
        </div>
      </div>
    </div>
  );
}
