"use client";

// Registry-driven custom-field inputs (participant spine, spec #4 D1). Renders
// one typed control per org field def, in sort order. When the org has no defs
// (AA today) it renders nothing, so the participant forms are unchanged.
//
// Type-only import from the server-only registry module — erased at build, so
// the client bundle never pulls the server code in.
import type { CustomFieldDef } from "@/lib/admin/customFields";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

export type CustomValues = Record<string, unknown>;

export default function CustomFields({
  defs,
  values,
  onChange,
  compact = false,
}: {
  defs: CustomFieldDef[];
  values: CustomValues;
  onChange: (next: CustomValues) => void;
  /** Tighter styling for the inline-edit grid. */
  compact?: boolean;
}) {
  if (defs.length === 0) return null;
  const set = (key: string, v: unknown) => onChange({ ...values, [key]: v });
  const cls = compact ? `${inputCls} block w-full mt-0.5 !py-1 !text-xs` : `${inputCls} w-full mt-1`;
  const labelCls = compact ? "text-[10px] text-ink-2" : "text-xs text-ink-2";

  return (
    <>
      {defs.map((d) => {
        const v = values[d.key];
        const label = (
          <span>
            {d.label}
            {d.required && <span className="text-orange"> *</span>}
          </span>
        );

        if (d.field_type === "boolean") {
          return (
            <label key={d.key} className={`${labelCls} flex items-center gap-2 self-end pb-2`}>
              <input
                type="checkbox"
                className="accent-orange"
                checked={v === true}
                onChange={(e) => set(d.key, e.target.checked)}
              />
              {label}
            </label>
          );
        }

        if (d.field_type === "select") {
          return (
            <label key={d.key} className={labelCls}>
              {label}
              <select className={cls} value={typeof v === "string" ? v : ""} onChange={(e) => set(d.key, e.target.value)}>
                <option value="">—</option>
                {(d.options ?? []).map((o) => (
                  <option key={o} value={o} className="bg-surface">{o}</option>
                ))}
              </select>
            </label>
          );
        }

        if (d.field_type === "multiselect") {
          const arr = Array.isArray(v) ? (v as string[]) : [];
          const toggle = (o: string) =>
            set(d.key, arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o]);
          return (
            <div key={d.key} className={labelCls}>
              {label}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(d.options ?? []).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => toggle(o)}
                    className={`px-2 py-1 rounded-full text-[11px] border ${
                      arr.includes(o)
                        ? "bg-orange/15 text-orange border-orange/40"
                        : "bg-tile text-ink-2 border-outline"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        const inputType =
          d.field_type === "number" ? "number" : d.field_type === "date" ? "date" : d.field_type === "email" ? "email" : "text";
        return (
          <label key={d.key} className={labelCls}>
            {label}
            <input
              type={inputType}
              className={cls}
              value={v === null || v === undefined ? "" : String(v)}
              onChange={(e) => set(d.key, e.target.value)}
            />
          </label>
        );
      })}
    </>
  );
}
