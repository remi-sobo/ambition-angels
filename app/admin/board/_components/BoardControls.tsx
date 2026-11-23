"use client";

// Client pieces of the Board module: the roster's row menu and add drawer
// (terms, COI, giving), meeting cards (agenda, attendance + quorum, minutes
// with approve-freeze). Mutations go through the admin APIs via saveAction,
// then router.refresh(). (V4 Stage G.)

import { useState } from "react";
import SectionHeading from "../../_components/SectionHeading";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { saveAction } from "@/lib/admin/saveAction";
import { ROLE_LABELS } from "@/lib/admin/board/roster";
import Button from "@/app/admin/_components/ui/Button";
import Drawer from "@/app/admin/_components/ui/Drawer";
import MoreActionsMenu from "@/app/admin/_components/ui/MoreActionsMenu";
import Input, { Textarea } from "@/app/admin/_components/ui/Input";
import { DateField, SelectField, TextField } from "@/app/admin/_components/ui/Field";

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




/**
 * A roster row's actions (V4 Stage G: one row menu instead of five inline
 * buttons): record COI, edit role and term (kit Drawer), mark past or
 * reactivate, remove. Every write goes through saveAction.
 */
export function MemberActions({ member, coiYear }: { member: BoardMember; coiYear: number }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [termEnd, setTermEnd] = useState(member.term_end ?? "");
  const [role, setRole] = useState(member.officer_role);
  const coiCurrent = !!member.coi_signed_at && member.coi_signed_at >= `${coiYear}-01-01`;

  const patch = async (fields: Record<string, unknown>, success?: string) => {
    setBusy(true);
    const r = await saveAction({
      request: { url: `/api/admin/board/members/${member.id}`, method: "PATCH", body: fields },
      success,
      toast,
    });
    setBusy(false);
    if (r.ok) router.refresh();
    return r.ok;
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${member.name} from the board roster?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const r = await saveAction({
      request: { url: `/api/admin/board/members/${member.id}`, method: "DELETE" },
      success: `${member.name} removed`,
      toast,
    });
    setBusy(false);
    if (r.ok) router.refresh();
  };

  return (
    <>
      <MoreActionsMenu
        label={`Actions for ${member.name}`}
        size="sm"
        disabled={busy}
        items={[
          ...(coiCurrent ? [] : [{ label: `Record COI (${coiYear})`, onSelect: () => void patch({ coi_signed_at: true }, "Conflict-of-interest form recorded") }]),
          { label: "Edit role and term", onSelect: () => setEditing(true) },
          member.status === "active"
            ? { label: "Mark past", onSelect: () => void patch({ status: "past" }, "Marked past") }
            : { label: "Reactivate", onSelect: () => void patch({ status: "active" }, "Reactivated") },
          { label: "Open profile", href: `/admin/organization/board/${member.id}` },
          { label: "Remove", danger: true, onSelect: () => void remove() },
        ]}
      />
      <Drawer
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${member.name}`}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={busy}
              onClick={async () => {
                if (await patch({ officer_role: role, term_end: termEnd || null }, "Saved")) setEditing(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <SelectField
            label="Officer role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <DateField label="Term ends" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} />
        </div>
      </Drawer>
    </>
  );
}

/** The Board page's primary action: Add member, in the kit Drawer. */
export function NewMemberForm() {
  const router = useRouter();
  const toast = useToast();
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
    const r = await saveAction({
      request: {
        url: "/api/admin/board/members",
        method: "POST",
        body: { name, email: email || undefined, officer_role: role, term_end: termEnd || undefined },
      },
      failure: false,
      success: `${name} added`,
      toast,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setName(""); setEmail(""); setTermEnd("");
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add member
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Add a board member"
        description="Only the name is required. An email that matches a donor record links giving automatically."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-board-member" loading={busy}>
              {busy ? "Saving" : "Add member"}
            </Button>
          </>
        }
      >
        <form id="new-board-member" onSubmit={submit} className="grid grid-cols-2 gap-4">
          <TextField className="col-span-2" label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} error={error || undefined} />
          <TextField className="col-span-2" label="Email" type="email" value={email} hint="Links giving automatically" onChange={(e) => setEmail(e.target.value)} />
          <SelectField
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <DateField label="Term ends" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} />
        </form>
      </Drawer>
    </>
  );
}

export function NewMeetingForm() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // null = the date input is closed (the native prompt is banned; this inline input
  // is its replacement).
  const [date, setDate] = useState<string | null>(null);

  const create = async () => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setBusy(true);
    const r = await saveAction({
      request: { url: "/api/admin/board/meetings", method: "POST", body: { meeting_date: date } },
      success: "Meeting created",
      toast,
    });
    setBusy(false);
    if (r.ok) {
      setDate(null);
      router.refresh();
    }
  };

  if (date !== null) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Input
          autoFocus
          type="date"
          aria-label="Meeting date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void create(); if (e.key === "Escape") setDate(null); }}
          className="!w-auto"
        />
        <Button type="button" size="sm" onClick={() => void create()} disabled={!date} loading={busy}>
          Create
        </Button>
        <Button type="button" size="sm" variant="quiet" onClick={() => setDate(null)} disabled={busy}>
          Cancel
        </Button>
      </span>
    );
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => setDate(new Date().toISOString().slice(0, 10))} disabled={busy}>
      New meeting
    </Button>
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
  const toast = useToast();
  const confirm = useConfirm();
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
    const r = await saveAction({
      request: { url: `/api/admin/board/meetings/${meeting.id}`, method: "PATCH", body: fields },
      toast,
    });
    setBusy(false);
    if (r.ok) router.refresh();
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
    <article className={`bg-surface border-hairline rounded-panel p-4 text-sm ${busy ? "opacity-60" : ""}`}>
      <button type="button" aria-expanded={open} className="w-full flex flex-wrap items-center gap-2 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="font-semibold text-ink-1">{meeting.title}</span>
        <span className="text-xs text-ink-2 tabular-nums">{meeting.meeting_date}</span>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            approved ? "bg-revenue-bg text-revenue" : "bg-status-watch-bg text-status-watch-text"
          }`}
        >
          {approved ? "Minutes approved" : "Draft"}
        </span>
        {meeting.attendance.length > 0 && (
          <span className={`text-xs ${quorum ? "text-revenue" : "text-expense"}`}>
            {presentCount}/{members.length} present · quorum {quorum ? "met" : "NOT met"}
          </span>
        )}
        <span className="ml-auto text-ink-2 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div>
            <SectionHeading as="h3" className="mb-1.5">
              Agenda
            </SectionHeading>
            <ol className="space-y-1">
              {meeting.agenda.map((a, i) => (
                <li key={i} className="text-sm text-ink-1">
                  {i + 1}. {a.title}
                  {a.kind === "consent" && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-tile text-ink-2">
                      consent block
                    </span>
                  )}
                </li>
              ))}
              {meeting.agenda.length === 0 && (
                <li className="text-xs text-ink-2">No items yet.</li>
              )}
            </ol>
            {!approved && (
              <div className="flex gap-2 mt-2">
                <Input
                  aria-label="New agenda item"
                  className="flex-1"
                  placeholder="Add an agenda item"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addAgendaItem("normal"); }
                  }}
                />
                <Button type="button" variant="secondary" onClick={() => addAgendaItem("normal")}>
                  Add
                </Button>
                <Button type="button" variant="quiet" onClick={() => addAgendaItem("consent")} title="Routine approvals bundled into one motion">
                  Add to consent
                </Button>
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
                    type="button"
                    aria-pressed={present}
                    disabled={approved || busy}
                    onClick={() => toggleAttendance(m.id)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      present
                        ? "bg-revenue-bg text-revenue border-revenue/30"
                        : "bg-tile text-ink-2 border-hairline hover:text-ink-1"
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
              <p className="text-sm text-ink-1 whitespace-pre-wrap border-hairline rounded-control p-3 bg-surface">
                {meeting.minutes ?? "—"}
              </p>
            ) : (
              <>
                <Textarea
                  aria-label={`Minutes for ${meeting.title}`}
                  className="min-h-[120px]"
                  placeholder={"Attendance & quorum noted above.\nMotions: text, mover, seconder, vote tally (for/against/abstain).\nDecisions and follow-ups with owners."}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
                <div className="flex gap-2 mt-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => void patch({ minutes })} disabled={busy}>
                    Save draft
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Approve minutes?",
                        body: "They become permanent and can no longer be edited.",
                        confirmLabel: "Approve & freeze",
                      });
                      if (ok) void patch({ approve: true });
                    }}
                    disabled={busy}
                  >
                    Approve and freeze
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
