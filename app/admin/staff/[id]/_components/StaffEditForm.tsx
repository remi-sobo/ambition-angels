"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { saveAction } from "@/lib/admin/saveAction";
import Button from "@/app/admin/_components/ui/Button";
import Drawer from "@/app/admin/_components/ui/Drawer";
import { DateField, SelectField, TextField } from "@/app/admin/_components/ui/Field";
import type { StaffRow } from "../../_lib/read";

/**
 * HR-admin edit for a person (staff.write): name, title, department, employment
 * type, manager, status, start date. V4 Stage G: the profile's primary
 * action, in the kit Drawer with labeled fields, saved through saveAction. The
 * self-service photo control stays separate. The reports_to trigger blocks a
 * cross-org or cyclic manager, surfaced as a clean error.
 */
export default function StaffEditForm({
  member,
  managerOptions,
}: {
  member: StaffRow;
  managerOptions: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
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

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    const r = await saveAction({
      request: { url: `/api/admin/staff/${member.id}`, method: "PATCH", body: { ...f, reports_to: f.reports_to || null } },
      success: "Saved",
      toast,
    });
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Edit details
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${member.full_name}`}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={`edit-staff-${member.id}`} loading={busy}>
              Save
            </Button>
          </>
        }
      >
        <form id={`edit-staff-${member.id}`} onSubmit={save} className="grid grid-cols-2 gap-4">
          <TextField className="col-span-2" label="Full name" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
          <TextField label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <TextField label="Department" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} />
          <SelectField
            label="Type"
            value={f.employment_type}
            onChange={(e) => setF({ ...f, employment_type: e.target.value })}
            options={[
              { value: "staff", label: "Staff" },
              { value: "contractor", label: "Contractor" },
              { value: "volunteer", label: "Volunteer" },
              { value: "board", label: "Board" },
            ]}
          />
          <SelectField
            label="Status"
            value={f.status}
            onChange={(e) => setF({ ...f, status: e.target.value })}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
          <SelectField
            className="col-span-2"
            label="Manager"
            value={f.reports_to}
            placeholder="No manager (top of chart)"
            onChange={(e) => setF({ ...f, reports_to: e.target.value })}
            options={managerOptions.filter((o) => o.id !== member.id).map((o) => ({ value: o.id, label: o.full_name }))}
          />
          <DateField label="Start date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
        </form>
      </Drawer>
    </>
  );
}
