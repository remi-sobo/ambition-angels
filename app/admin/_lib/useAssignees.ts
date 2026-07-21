"use client";

import { useEffect, useState } from "react";
import { deriveAssigneeOptions, type AssigneeOption } from "@/lib/admin/assignees";

/**
 * The active org's assignable people for client dropdowns/filters — replaces
 * the hardcoded Remi/Shannon lists so a second tenant sees its own members.
 * One fetch per page load (module-level promise cache shared by every
 * consumer); until it resolves, callers render just their static options
 * ("Unassigned" / "Everyone"), which is a fine flash.
 */

let cached: Promise<AssigneeOption[]> | null = null;

function fetchAssignees(): Promise<AssigneeOption[]> {
  if (!cached) {
    cached = fetch("/api/admin/members")
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d: { members?: Array<{ displayName: string; role?: string | null }> }) =>
        deriveAssigneeOptions(d.members ?? []),
      )
      .catch(() => {
        cached = null; // let a later mount retry
        return [];
      });
  }
  return cached;
}

/** Ensure `value` (a stored/preselected handle) stays selectable while the
 *  member list loads, or when it belongs to a departed/legacy assignee. */
export function withSelected(options: AssigneeOption[], value: string): AssigneeOption[] {
  if (!value || options.some((o) => o.value === value)) return options;
  return [{ value, label: value.charAt(0).toUpperCase() + value.slice(1) }, ...options];
}

export function useAssignees(): AssigneeOption[] {
  const [options, setOptions] = useState<AssigneeOption[]>([]);
  useEffect(() => {
    let alive = true;
    fetchAssignees().then((opts) => {
      if (alive) setOptions(opts);
    });
    return () => {
      alive = false;
    };
  }, []);
  return options;
}
