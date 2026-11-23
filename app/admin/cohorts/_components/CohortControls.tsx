"use client";

// Client pieces of the cohorts index: the new-cohort form.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { userMessage } from "@/lib/admin/errors";
import Button from "@/app/admin/_components/ui/Button";
import Drawer from "@/app/admin/_components/ui/Drawer";
import { DateField, TextField } from "@/app/admin/_components/ui/Field";

// V4 Stage E: the form is a kit Drawer (spec §5 Form archetype: a drawer
// for anything under about ten fields), so it works from a header, an
// empty state or a phone without squeezing a six-column grid.

export function NewCohortForm({ programs = [] }: { programs?: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [program, setProgram] = useState("");
  const [term, setTerm] = useState("");
  const [capacity, setCapacity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/cohorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          program: program || undefined,
          term: term || undefined,
          capacity: capacity ? Number(capacity) : undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }),
      });
      if (!res.ok) {
        // Keep the form open with what was typed, so a failed save can be fixed and retried.
        const j = await res.json().catch(() => ({}));
        toast.error(userMessage(res, j));
        return;
      }
      setName(""); setProgram(""); setTerm(""); setCapacity(""); setStartDate(""); setEndDate("");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        New cohort
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New cohort"
        description="Only the name is required. You can add people and sessions right after."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-cohort-form" loading={busy}>
              {busy ? "Saving" : "Create cohort"}
            </Button>
          </>
        }
      >
        <form id="new-cohort-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
          <TextField className="col-span-2" label="Name" required autoFocus value={name}
            placeholder="Fall Career Lab: Eastlake" onChange={(e) => setName(e.target.value)} />
          <TextField className="col-span-2" label="Program" value={program} list="cohort-programs"
            placeholder="Career Labs" onChange={(e) => setProgram(e.target.value)} />
          {programs.length > 0 && (
            <datalist id="cohort-programs">
              {programs.map((p) => <option key={p} value={p} />)}
            </datalist>
          )}
          <TextField label="Term" value={term} placeholder="Fall 2026" onChange={(e) => setTerm(e.target.value)} />
          <TextField label="Capacity" value={capacity} type="number" min={1} inputMode="numeric"
            placeholder="20" onChange={(e) => setCapacity(e.target.value)} />
          <DateField label="Starts" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <DateField label="Ends" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </form>
      </Drawer>
    </>
  );
}
