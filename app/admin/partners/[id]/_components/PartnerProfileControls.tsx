"use client";

// Client controls for a partner org profile: edit the org, manage its
// contacts (add / edit / delete / make-primary), and log a touch
// (call/email/meeting/note) against the org and optionally a contact.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { userMessage } from "@/lib/admin/errors";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { KIND_LABELS, inputCls } from "../../_lib/partners";
import { STATUS_ORDER, STATUS_LABELS } from "../../_lib/status";
import { TYPE } from "@/lib/admin/typeScale";
import { TextField, TextareaField, SelectField } from "@/app/admin/_components/ui/Field";

const splitCsv = (s: string): string[] =>
  s.split(",").map((x) => x.trim()).filter(Boolean);

export type ContactT = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  tags: string[];
  notes: string | null;
  is_primary: boolean;
};

function useBusy() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const call = async (
    url: string,
    method: string,
    body?: Record<string, unknown>,
    redirect?: string,
  ) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(userMessage(res, j)); return false; }
      if (redirect) router.push(redirect); else router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };
  return { busy, call };
}

// ── Edit the org ─────────────────────────────────────────────────────────
export function EditPartnerButton({ partner }: {
  partner: {
    id: string; name: string; kind: string; status: string;
    city: string | null; region: string | null; domain: string | null;
    priority_score: number | null; notes: string | null;
  };
}) {
  const { busy, call } = useBusy();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(partner.name);
  const [kind, setKind] = useState(partner.kind);
  const [status, setStatus] = useState(partner.status);
  const [city, setCity] = useState(partner.city ?? "");
  const [region, setRegion] = useState(partner.region ?? "");
  const [domain, setDomain] = useState(partner.domain ?? "");
  const [score, setScore] = useState(partner.priority_score?.toString() ?? "");
  const [notes, setNotes] = useState(partner.notes ?? "");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-semibold text-ink-2 hover:text-orange transition-colors">
        Edit
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await call(`/api/admin/partners/manage/${partner.id}`, "PATCH", {
          name, kind, status, city, region, domain,
          priority_score: score === "" ? null : Number(score),
          notes,
        });
        if (ok) setOpen(false);
      }}
      className="space-y-2 mt-1 w-full"
    >
      <TextField label="Organization" controlSize="md" className="w-full" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex gap-2">
        <SelectField label="Kind" controlSize="md" className="w-full" value={kind} onChange={(e) => setKind(e.target.value)} options={Object.entries(KIND_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
        <SelectField label="Status" controlSize="md" className="w-full" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_ORDER.map((st) => ({ value: st, label: STATUS_LABELS[st] }))} />
      </div>
      <div className="flex gap-2">
        <TextField label="City" controlSize="md" className="w-full" value={city} onChange={(e) => setCity(e.target.value)} />
        <TextField label="State / area" controlSize="md" className="w-28" value={region} onChange={(e) => setRegion(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <TextField label="Website" controlSize="md" className="w-full" value={domain} onChange={(e) => setDomain(e.target.value)} />
        <TextField label="Score (0–100)" controlSize="md" className="w-28" value={score} onChange={(e) => setScore(e.target.value)} inputMode="numeric" />
      </div>
      <TextareaField label="Notes" className="w-full" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-2 hover:text-ink-1 px-2 py-2">Cancel</button>
      </div>
    </form>
  );
}

// ── Contacts ──────────────────────────────────────────────────────────────
export function AddContactForm({ partnerId }: { partnerId: string }) {
  const { busy, call } = useBusy();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors">
        + Contact
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await call("/api/admin/partners/contacts", "POST", {
          partner_id: partnerId,
          first_name: first || undefined, last_name: last || undefined,
          email: email || undefined, phone: phone || undefined, title: title || undefined,
        });
        if (ok) { setFirst(""); setLast(""); setEmail(""); setPhone(""); setTitle(""); setOpen(false); }
      }}
      className="w-full bg-surface border-hairline rounded-panel p-3 grid grid-cols-2 gap-2 mt-2"
    >
      <TextField label="First name" controlSize="md" value={first} onChange={(e) => setFirst(e.target.value)} autoFocus />
      <TextField label="Last name" controlSize="md" value={last} onChange={(e) => setLast(e.target.value)} />
      <TextField label="Email" controlSize="md" value={email} onChange={(e) => setEmail(e.target.value)} />
      <TextField label="Phone" controlSize="md" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <TextField label="Title / role" controlSize="md" className="col-span-2" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="col-span-2 flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-1.5 rounded-full disabled:opacity-50">
          {busy ? "Adding…" : "Add contact"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-2 hover:text-ink-1 px-2">Cancel</button>
      </div>
    </form>
  );
}

export function ContactCard({ contact }: { contact: ContactT }) {
  const confirm = useConfirm();
  const { busy, call } = useBusy();
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(contact.first_name ?? "");
  const [last, setLast] = useState(contact.last_name ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [title, setTitle] = useState(contact.title ?? "");
  const [tags, setTags] = useState(contact.tags.join(", "));

  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "(no name)";

  if (editing) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await call(`/api/admin/partners/contacts/${contact.id}`, "PATCH", {
            first_name: first, last_name: last, email, phone, title, tags: splitCsv(tags),
          });
          if (ok) setEditing(false);
        }}
        className="bg-surface border-hairline rounded-panel p-3 grid grid-cols-2 gap-2"
      >
        <TextField label="First" controlSize="md" value={first} onChange={(e) => setFirst(e.target.value)} />
        <TextField label="Last" controlSize="md" value={last} onChange={(e) => setLast(e.target.value)} />
        <TextField label="Email" controlSize="md" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Phone" controlSize="md" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <TextField label="Title / role" controlSize="md" className="col-span-2" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField label="Tags" placeholder="Comma-separated: champion, decision-maker" controlSize="md" className="col-span-2" value={tags} onChange={(e) => setTags(e.target.value)} />
        <div className="col-span-2 flex items-center gap-2">
          <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-1.5 rounded-full disabled:opacity-50">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-ink-2 hover:text-ink-1 px-2">Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div className={`bg-surface border rounded-panel p-3 ${busy ? "opacity-60" : ""} ${contact.is_primary ? "border-orange/40" : "border-hairline"}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`font-semibold ${TYPE.body}`}>{name}</span>
        {contact.is_primary && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange/15 text-orange uppercase tracking-wider">Primary</span>
        )}
        {contact.title && <span className="text-xs text-ink-2">{contact.title}</span>}
        {contact.tags.map((t) => (
          <span key={t} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-tile text-ink-2 border border-hairline">{t}</span>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-ink-2 flex-wrap">
        {contact.email && <a href={`mailto:${contact.email}`} className="text-orange/80 hover:text-orange">{contact.email}</a>}
        {contact.phone && <span>{contact.phone}</span>}
      </div>
      <div className="flex items-center gap-1 mt-2">
        {!contact.is_primary && (
          <button onClick={() => call(`/api/admin/partners/contacts/${contact.id}`, "PATCH", { is_primary: true })}
            disabled={busy} className="text-xs px-2 py-1 rounded-control bg-tile hover:bg-tile text-ink-2">Make primary</button>
        )}
        <button onClick={() => setEditing(true)} className="text-xs px-2 py-1 rounded-control bg-tile hover:bg-tile text-ink-2">Edit</button>
        <button
          onClick={async () => {
            const ok = await confirm({
              title: `Remove ${name}?`,
              body: "The contact is removed from this partner.",
              confirmLabel: "Remove",
              destructive: true,
            });
            if (ok) void call(`/api/admin/partners/contacts/${contact.id}`, "DELETE");
          }}
          disabled={busy} className="ml-auto text-xs px-2 py-1 rounded-control text-ink-3 hover:text-expense">Remove</button>
      </div>
    </div>
  );
}

// ── Log a touch / meeting ──────────────────────────────────────────────────
const INT_KINDS = [
  ["meeting", "Meeting"], ["call", "Call"], ["email", "Email"], ["event", "Event"], ["note", "Note"],
] as const;

export function LogPartnerInteraction({ partnerId, contacts }: {
  partnerId: string;
  contacts: { id: string; name: string }[];
}) {
  const { busy, call } = useBusy();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("meeting");
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 10));
  const [contactId, setContactId] = useState("");
  const [notes, setNotes] = useState("");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors">
        + Log touch
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await call("/api/admin/partners/interactions", "POST", {
          partner_id: partnerId, kind, occurred_at: when || undefined,
          contact_id: contactId || undefined, notes: notes || undefined,
        });
        if (ok) { setNotes(""); setOpen(false); }
      }}
      className="px-5 py-4 border-b border-hairline flex flex-wrap items-end gap-3 bg-surface"
    >
      <label className="text-xs uppercase tracking-wider text-ink-3 font-semibold flex flex-col gap-1">
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
          {INT_KINDS.map(([v, l]) => <option key={v} value={v} className="bg-surface">{l}</option>)}
        </select>
      </label>
      <label className="text-xs uppercase tracking-wider text-ink-3 font-semibold flex flex-col gap-1">
        Date
        <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls + " w-40"} />
      </label>
      {contacts.length > 0 && (
        <label className="text-xs uppercase tracking-wider text-ink-3 font-semibold flex flex-col gap-1">
          With
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={inputCls}>
            <option value="" className="bg-surface">—</option>
            {contacts.map((c) => <option key={c.id} value={c.id} className="bg-surface">{c.name}</option>)}
          </select>
        </label>
      )}
      <label className="text-xs uppercase tracking-wider text-ink-3 font-semibold flex flex-col gap-1 flex-1 min-w-[14rem]">
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="what happened" className={inputCls + " w-full"} />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full disabled:opacity-50">
          {busy ? "Saving…" : "Log it"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-2 hover:text-ink-1 px-2 py-2">Cancel</button>
      </div>
    </form>
  );
}

// ── MOU / data agreement quick-edit ─────────────────────────────────────────
export function MouControls({ partner }: {
  partner: { id: string; mou_status: string; mou_end: string | null; data_agreement_signed: string | null };
}) {
  const { busy, call } = useBusy();
  const [mouStatus, setMouStatus] = useState(partner.mou_status);
  const [mouEnd, setMouEnd] = useState(partner.mou_end ?? "");
  const [dsa, setDsa] = useState(partner.data_agreement_signed ?? "");

  return (
    <div className="grid grid-cols-3 gap-2 items-end">
      <label className="text-xs uppercase tracking-wider text-ink-3 font-semibold">
        MOU
        <select value={mouStatus} onChange={(e) => setMouStatus(e.target.value)} className={inputCls + " w-full mt-1 !py-1.5 !text-xs"}>
          {["none", "drafting", "sent", "signed"].map((s) => <option key={s} value={s} className="bg-surface">{s}</option>)}
        </select>
      </label>
      <label className="text-xs uppercase tracking-wider text-ink-3 font-semibold">
        MOU ends
        <input type="date" value={mouEnd} onChange={(e) => setMouEnd(e.target.value)} className={inputCls + " w-full mt-1 !py-1.5 !text-xs"} />
      </label>
      <label className="text-xs uppercase tracking-wider text-ink-3 font-semibold">
        Data agreement
        <input type="date" value={dsa} onChange={(e) => setDsa(e.target.value)} className={inputCls + " w-full mt-1 !py-1.5 !text-xs"} />
      </label>
      <button
        onClick={() => call(`/api/admin/partners/manage/${partner.id}`, "PATCH", {
          mou_status: mouStatus, mou_end: mouEnd || null, data_agreement_signed: dsa || null,
        })}
        disabled={busy}
        className="col-span-3 text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-1.5 rounded-full disabled:opacity-50 justify-self-start"
      >
        {busy ? "Saving…" : "Save MOU"}
      </button>
    </div>
  );
}
