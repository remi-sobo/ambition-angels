"use client";

// Create a new funding angle (Phase 3). Inserts into strategy_angles via the
// admin route; the key is slugified server-side and it appends after the last
// angle. Name is required; the rest are the same fields the cards render.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Drawer from "@/app/admin/_components/ui/Drawer";
import Button from "@/app/admin/_components/ui/Button";
import { TextField, SelectField, TextareaField } from "@/app/admin/_components/ui/Field";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";

const BADGES = [
  ["", "No badge"],
  ["north-star", "North Star"],
  ["proven", "Proven"],
  ["building", "Building"],
  ["reframed", "Reframed"],
  ["productizing", "Productizing"],
  ["core-thesis", "Core thesis"],
  ["new", "New & timely"],
  ["emerging-stub", "Emerging stub"],
] as const;

export default function NewAngleForm() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", status_badge: "", hook: "", funds: "", want: "", ask: "", approach: "" });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    if (!f.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/strategy/angles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409) {
        toast.error("An angle with that name already exists.");
        return;
      }
      if (!r.ok) {
        toast.error(userMessage(r, d));
        return;
      }
      setF({ name: "", status_badge: "", hook: "", funds: "", want: "", ask: "", approach: "" });
      setOpen(false);
      router.refresh();
    } catch {
      toast.error(networkMessage());
    } finally {
      setBusy(false);
    }
  };

  // The kit Drawer (V4 P1) with labeled kit fields.
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors"
      >
        + New angle
      </button>
      <Drawer
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="New funding angle"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              {busy ? "Creating…" : "Create angle"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <TextField label="Name" required data-autofocus controlSize="md" value={f.name} onChange={set("name")} />
          <SelectField
            label="Status badge"
            controlSize="md"
            value={f.status_badge}
            onChange={set("status_badge")}
            options={BADGES.map(([v, label]) => ({ value: v, label }))}
          />
          <TextField label="Hook" controlSize="md" placeholder="The north-star one-liner" value={f.hook} onChange={set("hook")} />
          <TextareaField label="Who funds this" rows={2} value={f.funds} onChange={set("funds")} />
          <TextareaField label="What they want" rows={2} value={f.want} onChange={set("want")} />
          <TextField label="Ask range / model" controlSize="md" value={f.ask} onChange={set("ask")} />
          <TextareaField label="Approach (optional)" rows={2} placeholder="Cold vs warm note" value={f.approach} onChange={set("approach")} />
        </div>
      </Drawer>
    </>
  );
}
