"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { saveAction } from "@/lib/admin/saveAction";
import Button from "@/app/admin/_components/ui/Button";
import Drawer from "@/app/admin/_components/ui/Drawer";
import MoreActionsMenu from "@/app/admin/_components/ui/MoreActionsMenu";
import { TextField } from "@/app/admin/_components/ui/Field";

/**
 * Team page "More actions" (V4 Stage G): Reviews, People and roles (where
 * invites live), and for admins a rename so a tenant can relabel the module
 * ("Staff" → "Team" / "People") without a code change; it writes
 * org_terminology via the terminology route, in the kit Drawer.
 */
export default function StaffHeaderActions({
  canManage,
  currentLabel,
}: {
  canManage: boolean;
  currentLabel: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentLabel);
  const [busy, setBusy] = useState(false);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    const r = await saveAction({
      request: { url: "/api/admin/staff/terminology", method: "PUT", body: { term_key: "staff", label: value.trim() } },
      success: "Renamed",
      toast,
    });
    setBusy(false);
    if (r.ok) {
      setEditing(false);
      router.refresh();
    }
  }

  return (
    <>
      <MoreActionsMenu
        items={[
          { label: "Reviews", href: "/admin/staff/reviews" },
          { label: "People and roles", href: "/admin/settings/people" },
          ...(canManage ? [{ label: "Rename this module", onSelect: () => setEditing(true) }] : []),
        ]}
      />
      <Drawer
        open={editing}
        onClose={() => setEditing(false)}
        title="Rename this module"
        description="What your organization calls its team. Shown in the tab and the page title."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" form="rename-staff" loading={busy} disabled={!value.trim()}>
              Save
            </Button>
          </>
        }
      >
        <form id="rename-staff" onSubmit={save}>
          <TextField label="Name" required autoFocus value={value} placeholder="Staff" onChange={(e) => setValue(e.target.value)} />
        </form>
      </Drawer>
    </>
  );
}
