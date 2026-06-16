"use client";

// Client controls for constituent records (Epic B): create a donor, edit a
// donor, and log an interaction. Each calls the admin API then either routes
// to the new profile or router.refresh()es the current one.

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";
const labelCls =
  "flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold";

const splitCsv = (s: string): string[] =>
  s.split(",").map((x) => x.trim()).filter(Boolean);

export function NewDonorForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState<"person" | "organization">("person");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/constituents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          first_name: type === "person" ? first : undefined,
          last_name: type === "person" ? last : undefined,
          org_name: type === "organization" ? orgName : undefined,
          emails: email ? splitCsv(email) : undefined,
          phones: phone ? splitCsv(phone) : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      router.push(`/admin/fundraising/donors/${j.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create donor");
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors"
      >
        + New donor
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-4 flex flex-wrap items-end gap-3 w-full">
      <label className={labelCls}>
        Type
        <select value={type} onChange={(e) => setType(e.target.value as "person" | "organization")} className={inputCls}>
          <option value="person" className="bg-tile shadow-tile">Person</option>
          <option value="organization" className="bg-tile shadow-tile">Organization</option>
        </select>
      </label>
      {type === "person" ? (
        <>
          <label className={labelCls}>
            First name
            <input value={first} onChange={(e) => setFirst(e.target.value)} className={inputCls + " w-40"} />
          </label>
          <label className={labelCls}>
            Last name
            <input value={last} onChange={(e) => setLast(e.target.value)} className={inputCls + " w-40"} />
          </label>
        </>
      ) : (
        <label className={labelCls}>
          Organization name *
          <input required value={orgName} onChange={(e) => setOrgName(e.target.value)} className={inputCls + " w-56"} />
        </label>
      )}
      <label className={labelCls}>
        Email(s)
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="comma-separated" className={inputCls + " w-52"} />
      </label>
      <label className={labelCls}>
        Phone(s)
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="comma-separated" className={inputCls + " w-40"} />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Creating…" : "Create donor"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-2 py-2 transition-colors">
          Cancel
        </button>
      </div>
      {error && <p className="text-expense text-xs w-full">{error}</p>}
    </form>
  );
}

export type EditDonorValues = {
  id: string;
  type: "person" | "organization";
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  emails: string[];
  phones: string[];
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  tags: string[];
  do_not_contact: boolean;
  notes: string | null;
};

export function EditDonorButton({ donor }: { donor: EditDonorValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [first, setFirst] = useState(donor.first_name ?? "");
  const [last, setLast] = useState(donor.last_name ?? "");
  const [orgName, setOrgName] = useState(donor.org_name ?? "");
  const [emails, setEmails] = useState(donor.emails.join(", "));
  const [phones, setPhones] = useState(donor.phones.join(", "));
  const [street, setStreet] = useState(donor.street ?? "");
  const [city, setCity] = useState(donor.city ?? "");
  const [stateV, setStateV] = useState(donor.state ?? "");
  const [postal, setPostal] = useState(donor.postal_code ?? "");
  const [tags, setTags] = useState(donor.tags.join(", "));
  const [dnc, setDnc] = useState(donor.do_not_contact);
  const [notes, setNotes] = useState(donor.notes ?? "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/constituents/${donor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: donor.type === "person" ? first : undefined,
          last_name: donor.type === "person" ? last : undefined,
          org_name: donor.type === "organization" ? orgName : undefined,
          emails: splitCsv(emails),
          phones: splitCsv(phones),
          street, city, state: stateV, postal_code: postal,
          tags: splitCsv(tags),
          do_not_contact: dnc,
          notes,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] font-semibold text-ink-2 hover:text-orange transition-colors">
        Edit
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3 mt-1 w-full">
      {donor.type === "person" ? (
        <div className="flex gap-2">
          <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First" className={inputCls + " w-full"} />
          <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last" className={inputCls + " w-full"} />
        </div>
      ) : (
        <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organization" className={inputCls + " w-full"} />
      )}
      <input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="Emails (comma-separated)" className={inputCls + " w-full"} />
      <input value={phones} onChange={(e) => setPhones(e.target.value)} placeholder="Phones (comma-separated)" className={inputCls + " w-full"} />
      <div className="flex gap-2">
        <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street" className={inputCls + " w-full"} />
      </div>
      <div className="flex gap-2">
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className={inputCls + " w-full"} />
        <input value={stateV} onChange={(e) => setStateV(e.target.value)} placeholder="State" className={inputCls + " w-20"} />
        <input value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="ZIP" className={inputCls + " w-24"} />
      </div>
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (comma-separated)" className={inputCls + " w-full"} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={2} className={inputCls + " w-full resize-y"} />
      <label className="flex items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" checked={dnc} onChange={(e) => setDnc(e.target.checked)} className="accent-orange" />
        Do not contact
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-2 py-2 transition-colors">
          Cancel
        </button>
      </div>
      {error && <p className="text-expense text-xs">{error}</p>}
    </form>
  );
}

const INT_KINDS = [
  ["call", "Call"],
  ["email", "Email"],
  ["meeting", "Meeting"],
  ["event", "Event"],
  ["note", "Note"],
] as const;

export function LogInteractionForm({ constituentId }: { constituentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("call");
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ constituent_id: constituentId, kind, occurred_at: when || undefined, notes: notes || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setNotes("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors">
        + Log
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="px-5 py-4 border-b border-outline flex flex-wrap items-end gap-3 bg-tile">
      <label className={labelCls}>
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
          {INT_KINDS.map(([v, l]) => (
            <option key={v} value={v} className="bg-tile shadow-tile">{l}</option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        Date
        <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls + " w-40"} />
      </label>
      <label className={labelCls + " flex-1 min-w-[14rem]"}>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="what happened" className={inputCls + " w-full"} />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Log it"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-2 py-2 transition-colors">
          Cancel
        </button>
      </div>
      {error && <p className="text-expense text-xs w-full">{error}</p>}
    </form>
  );
}
