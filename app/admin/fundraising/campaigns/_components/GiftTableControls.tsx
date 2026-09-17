"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";
import { TYPE } from "@/lib/admin/typeScale";
import { Alert, Button, Field, Input, Modal, Select } from "@/app/admin/_components/ui";

/**
 * New gift table (specs/fundraising-gift-tables.md, Phase 2).
 *
 * Deliberately short: the window, what it must raise, the slippage on top, and
 * what a figure on the table will MEAN. Everything else — levels, rationale,
 * rounding — is edited on the table's own page, because those are decisions
 * you make while looking at the shape, not while naming it.
 */
export default function NewGiftTableForm() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [target, setTarget] = useState("");
  const [multiplier, setMultiplier] = useState("1.2");
  const [basis, setBasis] = useState<"window" | "annual" | "full_term">("window");

  const reset = () => {
    setName(""); setStartsOn(""); setEndsOn(""); setTarget("");
    setMultiplier("1.2"); setBasis("window"); setError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/fundraising/gift-tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          starts_on: startsOn,
          ends_on: endsOn,
          target: target ? Number(target) : 0,
          multiplier: Number(multiplier),
          coverage_basis: basis,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(userMessage(res, body));
        return;
      }
      toast.success("Gift table created. Add its levels next.");
      reset();
      setOpen(false);
      if (body.id) router.push(`/admin/fundraising/campaigns/gift-tables/${body.id}`);
      else router.refresh();
    } catch {
      setError(networkMessage());
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        New gift table
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New gift table">
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}

          <Field label="Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Year-End 2026"
              required
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Window opens" required>
              <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
            </Field>
            <Field label="Window closes" required>
              <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} required />
            </Field>
            <Field label="Target" hint="What this window must raise.">
              <Input
                type="number"
                min="0"
                step="1"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="350000"
              />
            </Field>
            <Field label="Multiplier" hint="Asks that don't close, gifts that come in under.">
              <Input
                type="number"
                min="0.1"
                step="0.05"
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Coverage basis"
            hint="A $25,000/year level on a 3-year term is $25,000 per year and $75,000 full term. Both are true; this picks which the table counts."
          >
            <Select value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)}>
              <option value="window">Window: what lands inside these dates</option>
              <option value="annual">Per year: one year at a time</option>
              <option value="full_term">Full term: the whole commitment</option>
            </Select>
          </Field>

          <p className={TYPE.metadata}>
            It starts as a draft: visible here, feeding no queues, creating no work until you make
            it active.
          </p>

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
