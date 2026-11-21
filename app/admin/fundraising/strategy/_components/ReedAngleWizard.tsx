"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReedMark } from "../../../_components/reed/ReedPanel";
import { ANGLE_BADGES, ANGLE_TONES } from "@/lib/admin/strategy/angle-fields";
import Drawer from "@/app/admin/_components/ui/Drawer";
import Button from "@/app/admin/_components/ui/Button";
import { TextField, SelectField, TextareaField } from "@/app/admin/_components/ui/Field";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { userMessage } from "@/lib/admin/errors";

// Reed-led wizard for a new framing angle. Step 1: describe the angle in a
// sentence. Step 2: Reed drafts the full angle (hook → ask) and you edit every
// element before it's created. On create it writes to strategy_angles and
// appears in the editor list + the public Strategy Room — still fully editable.

type Draft = {
  name: string;
  nav_title: string;
  status_badge: string;
  tone: string;
  hook: string;
  frame: string;
  lead: string;
  funds_label: string;
  funds: string;
  want: string;
  catch_label: string;
  catch_body: string;
  ask: string;
  flag: string;
};

const EMPTY: Draft = {
  name: "", nav_title: "", status_badge: "", tone: "neutral", hook: "", frame: "", lead: "",
  funds_label: "Who funds this", funds: "", want: "", catch_label: "", catch_body: "", ask: "", flag: "",
};

const BADGE_LABEL: Record<string, string> = {
  "north-star": "North Star", proven: "Proven", building: "Building", reframed: "Reframed",
  productizing: "Productizing", "core-thesis": "Core thesis", new: "New & timely", "emerging-stub": "Emerging stub",
};

const asStr = (v: unknown) => (typeof v === "string" ? v : "");

export default function ReedAngleWizard() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"brief" | "review">("brief");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  const reset = () => { setStage("brief"); setBrief(""); setDraft(EMPTY); setOpen(false); };

  const generate = async () => {
    if (!brief.trim()) { toast.error("Describe the angle first."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/strategy/angles/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: brief.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(userMessage(r, j)); return; }
      const a = (j.angle ?? {}) as Record<string, unknown>;
      setDraft({
        name: asStr(a.name), nav_title: asStr(a.nav_title), status_badge: asStr(a.status_badge),
        tone: asStr(a.tone) || "neutral", hook: asStr(a.hook), frame: asStr(a.frame), lead: asStr(a.lead),
        funds_label: asStr(a.funds_label) || "Who funds this", funds: asStr(a.funds), want: asStr(a.want),
        catch_label: asStr(a.catch_label), catch_body: asStr(a.catch_body), ask: asStr(a.ask), flag: asStr(a.flag),
      });
      setStage("review");
    } finally { setBusy(false); }
  };

  const create = async () => {
    if (!draft.name.trim()) { toast.error("The angle needs a name."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/strategy/angles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409) { toast.error("An angle with that name already exists."); return; }
      if (!r.ok) { toast.error(userMessage(r, j)); return; }
      reset();
      router.refresh();
    } finally { setBusy(false); }
  };

  // The kit Drawer (V4 P1) with labeled kit fields; the two steps share it.
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-navy hover:bg-navy-light px-4 py-2 rounded-full transition-colors"
      >
        <ReedMark className="w-3.5 h-3.5 text-orange-mid" />
        Draft an angle with Reed
      </button>
      <Drawer
        open={open}
        onClose={() => !busy && reset()}
        width={560}
        title={
          <span className="inline-flex items-center gap-2">
            <ReedMark className="w-4 h-4 text-orange" />
            {stage === "brief" ? "Draft a framing angle with Reed" : "Review Reed's draft"}
          </span>
        }
        description={
          stage === "brief"
            ? "Describe the angle in a sentence or two. The audience, the thesis, the kind of funder. Reed drafts the full card (hook, frame, who funds it, what they want, the ask) and you edit every element before it's created. Nothing is saved until you click Create."
            : undefined
        }
        footer={
          stage === "brief" ? (
            <>
              <Button variant="secondary" onClick={reset} disabled={busy}>
                Cancel
              </Button>
              <Button variant="strong" onClick={generate} loading={busy}>
                {busy ? "Reed is drafting…" : "Draft with Reed"}
              </Button>
            </>
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <Button variant="quiet" onClick={() => setStage("brief")} disabled={busy}>
                ← Redraft
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={reset} disabled={busy}>
                  Discard
                </Button>
                <Button onClick={create} loading={busy}>
                  {busy ? "Creating…" : "Create angle"}
                </Button>
              </div>
            </div>
          )
        }
      >
        {stage === "brief" ? (
          <TextareaField
            label="The angle"
            data-autofocus
            rows={4}
            placeholder="e.g. An angle for place-based collaboratives in Atlanta. Saturate one metro, prove outcomes, sell a city not a line item."
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <TextField className="sm:col-span-2" label="Name" controlSize="md" value={draft.name} onChange={set("name")} />
            <TextField label="Nav title" controlSize="md" value={draft.nav_title} onChange={set("nav_title")} />
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Badge"
                controlSize="md"
                value={draft.status_badge}
                onChange={set("status_badge")}
                placeholder="No badge"
                options={ANGLE_BADGES.map((b) => ({ value: b, label: BADGE_LABEL[b] ?? b }))}
              />
              <SelectField
                label="Tone"
                controlSize="md"
                value={draft.tone}
                onChange={set("tone")}
                options={ANGLE_TONES.map((t) => ({ value: t, label: t }))}
              />
            </div>
            <TextField className="sm:col-span-2" label="Hook" controlSize="md" value={draft.hook} onChange={set("hook")} />
            <TextareaField className="sm:col-span-2" label="Frame" rows={4} value={draft.frame} onChange={set("frame")} />
            <TextField className="sm:col-span-2" label="Lead line" controlSize="md" value={draft.lead} onChange={set("lead")} />
            <TextField label="Funds label" controlSize="md" value={draft.funds_label} onChange={set("funds_label")} />
            <div />
            <TextareaField label="Who funds this" rows={3} value={draft.funds} onChange={set("funds")} />
            <TextareaField label="What they want" rows={3} value={draft.want} onChange={set("want")} />
            <TextField label="Catch label (optional)" controlSize="md" value={draft.catch_label} onChange={set("catch_label")} />
            <TextareaField label="Catch body (optional)" rows={2} value={draft.catch_body} onChange={set("catch_body")} />
            <TextareaField className="sm:col-span-2" label="The ask" rows={2} value={draft.ask} onChange={set("ask")} />
            <TextField className="sm:col-span-2" label="Flag (optional)" controlSize="md" value={draft.flag} onChange={set("flag")} />
          </div>
        )}
      </Drawer>
    </>
  );
}
