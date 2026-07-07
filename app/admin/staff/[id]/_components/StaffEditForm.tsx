"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StaffRow } from "../../_lib/read";

/**
 * HR-admin edit for a person (staff.write): name, title, department, employment
 * type, manager, status, start date. A collapsible panel on the profile — the
 * self-service photo control stays separate. The reports_to trigger blocks a
 * cross-org or cyclic manager, surfaced as a clean error.
 */
const FIELD = "w-full rounded-md border border-outline bg-surface px-2 py-1.5 text-sm text-ink-1";

export default function StaffEditForm({
  member,
  managerOptions,
}: {
  member: StaffRow;
  managerOptions: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    full_name: member.full_name,
    title: member.title ?? "",
    department: member.department ?? "",
    employment_type: member.employment_type,
    status: member.status,
    start_date: member.start_date ?? "",
    reports_to: member.reports_to ?? "",
  });

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/staff/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, reports_to: f.reports_to || null }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else alert(((await res.json().catch(() => null)) as { error?: string })?.error ?? "Failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-ink-2 hover:text-orange self-start"
      >
        Edit details
      </button>
    );
  }

  return (
    <div className="rounded-card border-[1.5px] border-outline bg-tile shadow-tile p-4 flex flex-col gap-2">
      <input className={FIELD} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} placeholder="Full name" />
      <input className={FIELD} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title" />
      <input className={FIELD} value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} placeholder="Department" />
      <div className="flex gap-2">
        <select className={FIELD} value={f.employment_type} onChange={(e) => setF({ ...f, employment_type: e.target.value })}>
          <option value="staff">Staff</option>
          <option value="contractor">Contractor</option>
          <option value="volunteer">Volunteer</option>
          <option value="board">Board</option>
        </select>
        <select className={FIELD} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <select className={FIELD} value={f.reports_to} onChange={(e) => setF({ ...f, reports_to: e.target.value })}>
        <option value="">— No manager (top of chart) —</option>
        {managerOptions
          .filter((o) => o.id !== member.id)
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.full_name}
            </option>
          ))}
      </select>
      <input type="date" className={FIELD} value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
      <div className="flex items-center gap-2 mt-1">
        <button type="button" disabled={busy} onClick={save} className="rounded-md bg-orange px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink-3 hover:text-ink-1">
          Cancel
        </button>
      </div>
    </div>
  );
}
