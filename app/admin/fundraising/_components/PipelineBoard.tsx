"use client";

// The new-ask form for the Pipeline header. Same convention as
// GrantControls: call the admin APIs, then router.refresh() so the server
// page re-renders with fresh data. The card and its actions moved to
// PipelineBoardV4 at V4 B1.

import { useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/app/admin/_components/ui/Button";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";

const inputCls =
  "bg-tile border-hairline rounded-control px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

export function NewOpportunityForm() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [ask, setAsk] = useState("");
  const [probability, setProbability] = useState("");
  const [capacity, setCapacity] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [nextStepDue, setNextStepDue] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          constituent_name: name,
          ask_amount: ask ? Number(ask) : undefined,
          probability: probability ? Number(probability) : undefined,
          capacity_rating: capacity ? Number(capacity) : undefined,
          next_step: nextStep || undefined,
          next_step_due: nextStepDue || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(userMessage(res, j));
        return;
      }
      if (j.warning) toast.info(j.warning);
      setName(""); setAsk(""); setProbability(""); setCapacity("");
      setNextStep(""); setNextStepDue("");
      setOpen(false);
      router.refresh();
    } catch {
      setError(networkMessage());
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button type="button" size="lg" onClick={() => setOpen(true)}>
        Add an ask
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-full bg-surface border-hairline rounded-panel p-4 grid grid-cols-2 lg:grid-cols-6 gap-3 items-end"
    >
      <label className="col-span-2 text-xs text-ink-2">
        Donor / prospect name
        <input
          className={`${inputCls} w-full mt-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe or Acme Foundation"
          required
          autoFocus
        />
      </label>
      <label className="text-xs text-ink-2">
        Ask amount
        <input
          className={`${inputCls} w-full mt-1`}
          type="number"
          min="0"
          step="100"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="25000"
        />
      </label>
      <label className="text-xs text-ink-2">
        Probability %
        <input
          className={`${inputCls} w-full mt-1`}
          type="number"
          min="0"
          max="100"
          value={probability}
          onChange={(e) => setProbability(e.target.value)}
          placeholder="50"
        />
      </label>
      <label className="text-xs text-ink-2">
        Capacity (1–5)
        <input
          className={`${inputCls} w-full mt-1`}
          type="number"
          min="1"
          max="5"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          placeholder="3"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50"
        >
          {busy ? "Saving…" : "Create"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-ink-2 hover:text-ink-1 px-2"
        >
          Cancel
        </button>
      </div>
      <label className="col-span-2 lg:col-span-4 text-xs text-ink-2">
        Next move
        <input
          className={`${inputCls} w-full mt-1`}
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          placeholder="Coffee to introduce the spring cohort"
        />
      </label>
      <label className="text-xs text-ink-2">
        Due
        <input
          className={`${inputCls} w-full mt-1`}
          type="date"
          value={nextStepDue}
          onChange={(e) => setNextStepDue(e.target.value)}
        />
      </label>
      {error && <p className="col-span-full text-expense text-xs">{error}</p>}
    </form>
  );
}
