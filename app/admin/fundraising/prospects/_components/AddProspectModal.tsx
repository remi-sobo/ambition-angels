"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { userMessage } from "@/lib/admin/errors";
import Drawer from "@/app/admin/_components/ui/Drawer";
import Button from "@/app/admin/_components/ui/Button";
import { TextField, TextareaField } from "@/app/admin/_components/ui/Field";

// Manually add a prospect to the bench. The simplest intake — someone you know
// is worth tracking, no HubSpot record needed. POSTs to /prospects/add.

const TYPES = [
  { value: "individual", label: "Individual" },
  { value: "foundation", label: "Foundation" },
  { value: "corporate", label: "Corporate" },
] as const;

export default function AddProspectModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("individual");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/fundraising/prospects/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          email: email.trim() || undefined,
          org_name: org.trim() || undefined,
          strategy_note: note.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(userMessage(r, b));
      }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add prospect");
    } finally {
      setSaving(false);
    }
  }

  // The kit Drawer (V4 P1): focus trap, Escape and scrim cancel (held while
  // saving), a phone sheet and a pinned footer.
  return (
    <Drawer
      open
      onClose={() => !saving && onClose()}
      title="Add prospect"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="add-prospect-form" loading={saving}>
            {saving ? "Adding…" : "Add to bench"}
          </Button>
        </>
      }
    >
      <form id="add-prospect-form" onSubmit={submit} className="space-y-4">
        <TextField
          label="Name"
          required
          data-autofocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Person or organization"
        />

        <div role="group" aria-labelledby="add-prospect-type">
          <div id="add-prospect-type" className="text-xs uppercase tracking-wider text-ink-2 mb-1.5">
            Type
          </div>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={type === t.value}
                onClick={() => setType(t.value)}
                className={`py-2 rounded-control text-sm font-medium transition-colors ${
                  type === t.value ? "border-orange bg-orange/15 text-ink-1" : "border-hairline bg-tile text-ink-2 hover:text-ink-1"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" />
        <TextField label="Organization" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="optional" />
        <TextareaField
          label="Why / angle"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Why they're a fit (optional)"
        />

        {error && (
          <p role="alert" className="text-status-critical-text text-xs">
            {error}
          </p>
        )}
      </form>
    </Drawer>
  );
}
