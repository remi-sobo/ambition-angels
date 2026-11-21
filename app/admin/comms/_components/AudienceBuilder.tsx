"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../../_components/ui/Button";
import Notice from "../../_components/ui/Notice";
import { SelectField, TextField, DateField } from "../../_components/ui/Field";
import { useSaveAction } from "../../_lib/useSaveAction";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The segment builder with a live count (V4 Stage D). Built on the saved
 * views from Donors & Funders: start from one, narrow it with giving-history
 * filters, and watch the count the send would use. Every change re-resolves
 * through the send path's own resolver (POST /api/admin/comms/audience/count),
 * so the number here is the number that gets emailed, with who is left out
 * and why. Fail closed: a filter the resolver can't apply shows its reason
 * and a count of nobody.
 */

export type SegmentOption = { id: string; name: string; definition: Record<string, string> | null };

type Count = {
  recipients: number;
  excluded: { doNotContact: number; suppressed: number; noEmail: number };
  error: string | null;
  max_recipients: number;
  sample: string[];
  checked_at: string;
};

const VIEW_OPTIONS = [
  { value: "all", label: "Everyone on the list" },
  { value: "donors", label: "Donors" },
  { value: "recurring", label: "Recurring donors" },
  { value: "lapsed", label: "Lapsed: gave before, not this year" },
  { value: "volunteers", label: "Volunteers" },
];
const TYPE_OPTIONS = [
  { value: "", label: "People and organizations" },
  { value: "person", label: "People only" },
  { value: "organization", label: "Organizations only" },
];

type FilterKey = "view" | "type" | "min_total" | "since" | "tag" | "source" | "q";

function clean(def: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(def)) if (v && v.trim()) out[k] = v.trim();
  return out;
}

export default function AudienceBuilder({
  segments,
  value,
  onChange,
}: {
  segments: SegmentOption[];
  /** The attached saved segment id, if any. */
  value: string | null;
  /** Called with a saved segment id once one is chosen or saved. */
  onChange: (segmentId: string | null) => void;
}) {
  const save = useSaveAction();
  const base = segments.find((s) => s.id === value) ?? null;
  const [baseId, setBaseId] = useState<string>(value ?? "");
  const [def, setDef] = useState<Record<string, string>>(clean(base?.definition ?? {}));
  const [name, setName] = useState("");
  const [count, setCount] = useState<Count | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const baseDef = useMemo(() => clean(segments.find((s) => s.id === baseId)?.definition ?? {}), [segments, baseId]);
  const current = clean(def);
  const changed = JSON.stringify(current) !== JSON.stringify(baseDef) || !baseId;

  // Live count: re-resolve 300 ms after the last change.
  useEffect(() => {
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/comms/audience/count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ definition: current }),
        });
        const j = (await res.json()) as Count & { error?: string };
        if (n === seq.current) setCount(res.ok ? j : { recipients: 0, excluded: { doNotContact: 0, suppressed: 0, noEmail: 0 }, error: j.error ?? "Couldn't count this audience.", max_recipients: 0, sample: [], checked_at: new Date().toISOString() });
      } catch {
        if (n === seq.current) setCount(null);
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(current)]);

  const set = (k: FilterKey, v: string) => setDef((d) => ({ ...d, [k]: v }));
  const pickBase = (id: string) => {
    setBaseId(id);
    setDef(clean(segments.find((s) => s.id === id)?.definition ?? {}));
    if (id) onChange(id);
  };

  const saveAudience = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const r = await save<{ id: string }>({
      request: { url: "/api/admin/segments", method: "POST", body: { name, definition: current } },
      success: "Audience saved.",
    });
    setBusy(false);
    if (r.ok) {
      setBaseId(r.data.id);
      onChange(r.data.id);
    }
  };

  const left = count
    ? [
        count.excluded.noEmail ? `${count.excluded.noEmail} have no email` : "",
        count.excluded.suppressed ? `${count.excluded.suppressed} unsubscribed or bounced` : "",
        count.excluded.doNotContact ? `${count.excluded.doNotContact} marked do not contact` : "",
      ].filter(Boolean)
    : [];

  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label="Start from a saved view"
        placeholder="Build a new audience"
        options={segments.map((s) => ({ value: s.id, label: s.name }))}
        value={baseId}
        onChange={(e) => pickBase(e.target.value)}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SelectField label="Who" options={VIEW_OPTIONS} value={def.view ?? "all"} onChange={(e) => set("view", e.target.value)} />
        <SelectField label="Kind" options={TYPE_OPTIONS} value={def.type ?? ""} onChange={(e) => set("type", e.target.value)} />
        <TextField label="Gave at least ($, lifetime)" inputMode="decimal" value={def.min_total ?? ""} onChange={(e) => set("min_total", e.target.value)} />
        <DateField label="Last gift on or after" value={def.since ?? ""} onChange={(e) => set("since", e.target.value)} />
        <TextField label="Tag" value={def.tag ?? ""} onChange={(e) => set("tag", e.target.value)} />
      </div>

      <div className="rounded-control border border-hairline bg-tile px-3 py-2.5" aria-live="polite" data-testid="audience-count">
        {loading && !count ? (
          <p className={TYPE.bodyMuted}>Counting...</p>
        ) : count?.error ? (
          <Notice tone="danger" inline title="This audience emails nobody.">{count.error}</Notice>
        ) : count ? (
          <>
            <p className={`${TYPE.body} font-semibold`}>
              {count.recipients.toLocaleString("en-US")} {count.recipients === 1 ? "person" : "people"} would get this email
              {loading ? " (updating)" : ""}
            </p>
            <p className={TYPE.metadata}>
              {left.length ? `Left out: ${left.join(", ")}. ` : "No one in this audience is left out. "}
              Archived records are never included. Counted just now.
            </p>
            {count.recipients > count.max_recipients && (
              <p className="text-xs text-expense mt-1">Over the {count.max_recipients.toLocaleString("en-US")} limit for one send. Narrow it first.</p>
            )}
            {count.sample.length > 0 && <p className={`${TYPE.metadata} mt-1`}>Including {count.sample.join(", ")}</p>}
          </>
        ) : (
          <p className={TYPE.bodyMuted}>Couldn&rsquo;t count just now.</p>
        )}
      </div>

      {changed && (
        <div className="flex flex-wrap items-end gap-2">
          <TextField label="Save this audience as" className="flex-1 min-w-[12rem]" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gave in 2025, not yet in 2026" />
          <Button variant="secondary" loading={busy} disabled={!name.trim() || !!count?.error} onClick={() => void saveAudience()}>
            Save and use
          </Button>
        </div>
      )}
    </div>
  );
}
