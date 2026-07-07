"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Staff page header actions: a Reviews link, and (for admins) an inline rename so
 * a tenant can relabel the module ("Staff" → "Team" / "People") without a code
 * change — writes org_terminology via the terminology route.
 */
export default function StaffHeaderActions({
  canManage,
  currentLabel,
}: {
  canManage: boolean;
  currentLabel: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentLabel);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/staff/terminology", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term_key: "staff", label: value.trim() }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else alert(((await res.json().catch(() => null)) as { error?: string })?.error ?? "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {canManage &&
        (editing ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Staff"
              className="w-28 rounded-md border border-outline bg-surface px-2 py-1 text-sm text-ink-1"
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-md bg-orange px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-ink-3 hover:text-ink-1">
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-semibold text-ink-2 hover:text-orange"
            title="Rename this module for your org"
          >
            Rename
          </button>
        ))}
      <Link
        href="/admin/staff/reviews"
        className="rounded-md border border-outline px-3 py-1.5 text-sm font-semibold text-ink-1 hover:border-orange/50"
      >
        Reviews
      </Link>
    </div>
  );
}
