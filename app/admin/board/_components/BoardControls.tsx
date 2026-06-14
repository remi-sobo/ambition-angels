"use client";

// Client pieces of the Board module: member rows (terms, COI, giving),
// meeting cards (agenda, attendance + quorum, minutes with approve-freeze).
// Mutations go through the admin APIs, then router.refresh().

import { useState } from "react";
import SectionHeading from "../../_components/SectionHeading";
import { useRouter } from "next/navigation";

export type BoardMember = {
  id: string;
  constituent_id: string | null;
  name: string;
  email: string | null;
  officer_role: string;
  term_start: string | null;
  term_end: string | null;
  term_number: number;
  coi_signed_at: string | null;
  status: string;
};

export type BoardMeeting = {
  id: string;
  meeting_date: string;
  title: string;
  agenda: Array<{ title: string; kind: string; notes: string }>;
  attendance: Array<{ member_id: string; present: boolean }>;
  quorum_met: boolean | null;
  minutes: string | null;
  minutes_status: string;
  approved_at: string | null;
};

const inputCls =
  "bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cream text-sm placeholder-gray-mid focus:outline-none focus:border-orange/40";

const ROLE_LABELS: Record<string, string> = {
  chair: "Chair",
  vice_chair: "Vice Chair",
  secretary: "Secretary",
  treasurer: "Treasurer",
  member: "Member",
};

export function MemberRow({
  member,
  gaveThisYear,
  coiYear,
}: {
  member: BoardMember;
  gaveThisYear: boolean;
  coiYear: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [termEnd, setTermEnd] = useState(member.term_end ?? "");
  const [role, setRole] = useState(member.officer_role);

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/board/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove ${member.name} from the board roster?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/board/members/${member.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const coiCurrent = !!member.coi_signed_at && member.coi_signed_at >= `${coiYear}-01-01`;
  const termPast = !!member.term_end && member.term_end < today;
  const termSoon =
    !!member.term_end &&
    !termPast &&
    member.term_end <= new Date(Date.now() + 180 * 86400_000).toISOString().slice(0, 10);

  return (
    <article
      className={`bg-[#161926] border border-white/10 rounded-xl p-3 text-sm ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-cream">{member.name}</span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-gray-mid uppercase tracking-wider">
          {ROLE_LABELS[member.officer_role] ?? member.officer_role}
        </span>
        {member.status !== "active" && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-mid">
            {member.status}
          </span>
        )}
        {member.term_end && (
          <span
            className={`text-[11px] tabular-nums ${
              termPast ? "text-red-300 font-semibold" : termSoon ? "text-amber-400" : "text-gray-mid"
            }`}
            title={`Term ${member.term_number}`}
          >
            term ends {member.term_end}
            {termPast ? " · expired" : termSoon ? " · soon" : ""}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-[11px]">
          <span
            className={coiCurrent ? "text-green-400" : "text-red-300"}
            title={member.coi_signed_at ? `COI signed ${member.coi_signed_at}` : "No COI on file"}
          >
            COI {coiCurrent ? "✓" : "✗"}
          </span>
          <span
            className={gaveThisYear ? "text-green-400" : "text-gray-mid"}
            title={
              member.constituent_id
                ? gaveThisYear
                  ? "Gave this year"
                  : "No gift this year"
                : "Not linked to a donor record"
            }
          >
            Gave {gaveThisYear ? "✓" : member.constituent_id ? "—" : "?"}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1 mt-2">
        {!coiCurrent && (
          <button
            onClick={() => patch({ coi_signed_at: true })}
            disabled={busy}
            className="px-2 py-1 rounded-md text-[11px] font-semibold bg-orange/15 text-orange hover:bg-orange/25"
          >
            Record COI ({coiYear})
          </button>
        )}
        <button
          onClick={() => setEditing((v) => !v)}
          className="px-2 py-1 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-cream/70"
        >
          Edit
        </button>
        {member.status === "active" ? (
          <button
            onClick={() => patch({ status: "past" })}
            disabled={busy}
            className="px-2 py-1 rounded-md text-[11px] text-gray-mid hover:text-cream"
          >
            Mark past
          </button>
        ) : (
          <button
            onClick={() => patch({ status: "active" })}
            disabled={busy}
            className="px-2 py-1 rounded-md text-[11px] text-gray-mid hover:text-cream"
          >
            Reactivate
          </button>
        )}
        <button
          onClick={() => void remove()}
          disabled={busy}
          className="ml-auto px-2 py-1 rounded-md text-[11px] text-gray-mid hover:text-red-300"
        >
          Remove
        </button>
      </div>
      {editing && (
        <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-end gap-3">
          <label className="text-[10px] text-gray-mid">
            Officer role
            <select
              className={`${inputCls} block mt-0.5 !py-1 !text-xs`}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-[10px] text-gray-mid">
            Term ends
            <input
              className={`${inputCls} block mt-0.5 !py-1 !text-xs`}
              type="date"
              value={termEnd}
              onChange={(e) => setTermEnd(e.target.value)}
            />
          </label>
          <button
            onClick={() => {
              void patch({ officer_role: role, term_end: termEnd || null });
              setEditing(false);
            }}
            className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1 rounded-full"
          >
            Save
          </button>
        </div>
      )}
    </article>
  );
}

export function NewMemberForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [termEnd, setTermEnd] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/board/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: email || undefined,
          officer_role: role,
          term_end: termEnd || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setName(""); setEmail(""); setTermEnd("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors"
      >
        + Add member
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-full bg-white/[0.03] border border-white/10 rounded-card p-4 grid grid-cols-2 lg:grid-cols-5 gap-3 items-end"
    >
      <label className="text-xs text-gray-mid">
        Name
        <input className={`${inputCls} w-full mt-1`} value={name} required autoFocus
          onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="text-xs text-gray-mid">
        Email
        <input className={`${inputCls} w-full mt-1`} type="email" value={email}
          placeholder="links giving automatically" onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="text-xs text-gray-mid">
        Role
        <select className={`${inputCls} w-full mt-1`} value={role} onChange={(e) => setRole(e.target.value)}>
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-gray-mid">
        Term ends
        <input className={`${inputCls} w-full mt-1`} type="date" value={termEnd}
          onChange={(e) => setTermEnd(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs text-gray-mid hover:text-cream px-2">
          Cancel
        </button>
      </div>
      {error && <p className="col-span-full text-red-400 text-xs">{error}</p>}
    </form>
  );
}

export function NewMeetingForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const date = prompt("Meeting date (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/board/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_date: date }),
      });
      if (!res.ok) alert("Could not create meeting");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={() => void create()} disabled={busy}
      className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
      + New meeting
    </button>
  );
}

export function MeetingCard({
  meeting,
  members,
}: {
  meeting: BoardMeeting;
  members: BoardMember[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(meeting.minutes ?? "");
  const [newItem, setNewItem] = useState("");
  const approved = meeting.minutes_status === "approved";

  const presentIds = new Set(
    meeting.attendance.filter((a) => a.present).map((a) => a.member_id)
  );
  const presentCount = members.filter((m) => presentIds.has(m.id)).length;
  const quorum = members.length > 0 && presentCount > members.length / 2;

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/board/meetings/${meeting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggleAttendance = (memberId: string) => {
    const next = members.map((m) => ({
      member_id: m.id,
      present: m.id === memberId ? !presentIds.has(m.id) : presentIds.has(m.id),
    }));
    const nextPresent = next.filter((a) => a.present).length;
    void patch({
      attendance: next,
      quorum_met: members.length > 0 && nextPresent > members.length / 2,
    });
  };

  const addAgendaItem = (kind: "normal" | "consent") => {
    if (!newItem.trim()) return;
    void patch({
      agenda: [...meeting.agenda, { title: newItem.trim(), kind, notes: "" }],
    });
    setNewItem("");
  };

  return (
    <article className={`bg-[#161926] border border-white/10 rounded-xl p-4 text-sm ${busy ? "opacity-60" : ""}`}>
      <button className="w-full flex flex-wrap items-center gap-2 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="font-semibold text-cream">{meeting.title}</span>
        <span className="text-[12px] text-gray-mid tabular-nums">{meeting.meeting_date}</span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            approved ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400"
          }`}
        >
          {approved ? "Minutes approved" : "Draft"}
        </span>
        {meeting.attendance.length > 0 && (
          <span className={`text-[11px] ${quorum ? "text-green-400" : "text-red-300"}`}>
            {presentCount}/{members.length} present · quorum {quorum ? "met" : "NOT met"}
          </span>
        )}
        <span className="ml-auto text-gray-mid text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div>
            <SectionHeading as="h3" className="mb-1.5">
              Agenda
            </SectionHeading>
            <ol className="space-y-1">
              {meeting.agenda.map((a, i) => (
                <li key={i} className="text-[13px] text-cream/85">
                  {i + 1}. {a.title}
                  {a.kind === "consent" && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-mid">
                      consent block
                    </span>
                  )}
                </li>
              ))}
              {meeting.agenda.length === 0 && (
                <li className="text-[12px] text-gray-mid">No items yet.</li>
              )}
            </ol>
            {!approved && (
              <div className="flex gap-2 mt-2">
                <input
                  className={`${inputCls} flex-1 !py-1.5 !text-xs`}
                  placeholder="Add agenda item…"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addAgendaItem("normal"); }
                  }}
                />
                <button onClick={() => addAgendaItem("normal")}
                  className="text-[11px] bg-white/5 hover:bg-white/10 text-cream/70 px-3 rounded-lg">
                  Add
                </button>
                <button onClick={() => addAgendaItem("consent")}
                  title="Routine approvals bundled into one motion"
                  className="text-[11px] bg-white/5 hover:bg-white/10 text-cream/70 px-3 rounded-lg">
                  Add to consent
                </button>
              </div>
            )}
          </div>

          <div>
            <SectionHeading as="h3" className="mb-1.5">
              Attendance
            </SectionHeading>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const present = presentIds.has(m.id);
                return (
                  <button
                    key={m.id}
                    disabled={approved || busy}
                    onClick={() => toggleAttendance(m.id)}
                    className={`text-[11px] px-3 py-1 rounded-full border transition-colors ${
                      present
                        ? "bg-green-500/15 text-green-400 border-green-500/30"
                        : "bg-white/5 text-gray-mid border-white/10 hover:text-cream"
                    }`}
                  >
                    {m.name.split(" ")[0]} {present ? "✓" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <SectionHeading as="h3" className="mb-1.5">
              Minutes
            </SectionHeading>
            {approved ? (
              <p className="text-[13px] text-cream/85 whitespace-pre-wrap border border-white/10 rounded-lg p-3 bg-white/[0.02]">
                {meeting.minutes ?? "—"}
              </p>
            ) : (
              <>
                <textarea
                  className={`${inputCls} w-full min-h-[120px] text-[13px]`}
                  placeholder={"Attendance & quorum noted above.\nMotions: text, mover, seconder, vote tally (for/against/abstain).\nDecisions and follow-ups with owners."}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => void patch({ minutes })}
                    disabled={busy}
                    className="text-[11px] bg-white/5 hover:bg-white/10 text-cream/70 px-3 py-1.5 rounded-lg"
                  >
                    Save draft
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Approve minutes? They become permanent and can no longer be edited."))
                        void patch({ approve: true });
                    }}
                    disabled={busy}
                    className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full"
                  >
                    Approve & freeze
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
