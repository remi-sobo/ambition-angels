"use client";

// Client pieces of the volunteer (Leader) list: the new-volunteer form and
// the per-row unflag action. Records are constituents (is_volunteer = true);
// the row links to the standard constituent profile.

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm focus:outline-none focus:border-orange/40";

export function NewVolunteerForm({ term = "volunteer" }: { term?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/constituents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName || undefined,
          emails: email ? [email] : undefined,
          phones: phone ? [phone] : undefined,
          is_volunteer: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setFirstName(""); setLastName(""); setEmail(""); setPhone("");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors">
        + Add {term.toLowerCase()}
      </button>
    );
  }

  return (
    <form onSubmit={submit}
      className="w-full bg-surface shadow-panel border-[1.5px] border-outline rounded-card p-4 grid grid-cols-2 lg:grid-cols-5 gap-3 items-end">
      <label className="text-xs text-ink-2">
        First name
        <input className={`${inputCls} w-full mt-1`} value={firstName} required autoFocus
          onChange={(e) => setFirstName(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Last name
        <input className={`${inputCls} w-full mt-1`} value={lastName}
          onChange={(e) => setLastName(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Email
        <input className={`${inputCls} w-full mt-1`} type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Phone
        <input className={`${inputCls} w-full mt-1`} value={phone}
          onChange={(e) => setPhone(e.target.value)} />
      </label>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs text-ink-2 hover:text-ink-1 px-2 py-2">
          Cancel
        </button>
        <button type="submit" disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export function UnflagButton({ id, name, term = "volunteer" }: { id: string; name: string; term?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const unflag = async () => {
    if (!confirm(`Remove ${name} from the ${term.toLowerCase()} list? The record stays in fundraising.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/constituents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_volunteer: false }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={() => void unflag()} disabled={busy}
      className="text-[11px] text-ink-3 hover:text-expense transition-colors">
      Remove
    </button>
  );
}
