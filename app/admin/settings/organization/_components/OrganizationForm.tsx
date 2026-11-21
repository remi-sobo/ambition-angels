"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import Button from "@/app/admin/_components/ui/Button";
import { SelectField, TextField } from "@/app/admin/_components/ui/Field";
import { MONTHS, TIMEZONE_CHOICES, type OrgAddress } from "@/lib/admin/orgIdentity";

// V4 Stage F: Settings → Organization, the identity form. One save for the
// section (spec §5 Settings archetype). No optimistic change: the page
// re-reads after a save, and a refusal shows the server's sentence on the
// field it names.

export type OrgFormValues = {
  name: string;
  legalName: string;
  ein: string;
  address: OrgAddress;
  timezone: string;
  fiscalMonth: number | null;
};

export default function OrganizationForm({ initial }: { initial: OrgFormValues }) {
  const router = useRouter();
  const save = useSaveAction();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field: string; message: string } | null>(null);
  const set = <K extends keyof OrgFormValues>(k: K, val: OrgFormValues[K]) => setV((o) => ({ ...o, [k]: val }));
  const setAddr = (k: keyof OrgAddress, val: string) => setV((o) => ({ ...o, address: { ...o.address, [k]: val } }));
  const fieldErr = (f: string) => (err?.field === f ? err.message : undefined);

  const tzOptions = TIMEZONE_CHOICES.some((t) => t.value === v.timezone) || !v.timezone
    ? TIMEZONE_CHOICES
    : [{ value: v.timezone, label: v.timezone }, ...TIMEZONE_CHOICES];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    let field = "form";
    const r = await save({
      request: async () => {
        const res = await fetch("/api/admin/settings/organization", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: v.name,
            legal_name: v.legalName,
            ein: v.ein,
            address: v.address,
            timezone: v.timezone,
            fiscal_year_start_month: v.fiscalMonth,
          }),
        });
        if (!res.ok) {
          const j = await res.clone().json().catch(() => ({}));
          if (typeof j.field === "string") field = j.field;
        }
        return res;
      },
      success: "Organization details saved",
      failure: false,
    });
    setBusy(false);
    if (!r.ok) {
      setErr({ field, message: r.message });
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-panel border border-hairline bg-surface px-5 py-5 space-y-5" aria-labelledby="org-identity-h">
      <div>
        <h2 id="org-identity-h" className="text-[17px] font-semibold text-ink-1">Who you are</h2>
        <p className="text-sm text-ink-2 mt-0.5">
          Your legal name, address and EIN print on every donor receipt and thank-you letter.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="Name people know you by" required value={v.name} onChange={(e) => set("name", e.target.value)} error={fieldErr("name")} />
        <TextField
          label="Legal name"
          hint="As it appears on your IRS determination letter."
          value={v.legalName}
          onChange={(e) => set("legalName", e.target.value)}
          error={fieldErr("legal_name")}
        />
        <TextField
          label="EIN"
          hint="Nine digits, like 12-3456789."
          inputMode="numeric"
          value={v.ein}
          onChange={(e) => set("ein", e.target.value)}
          error={fieldErr("ein")}
        />
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-1">Mailing address</legend>
        <TextField label="Street" value={v.address.street} onChange={(e) => setAddr("street", e.target.value)} autoComplete="street-address" />
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_140px] gap-4">
          <TextField label="City" value={v.address.city} onChange={(e) => setAddr("city", e.target.value)} autoComplete="address-level2" />
          <TextField label="State" value={v.address.state} onChange={(e) => setAddr("state", e.target.value)} error={fieldErr("state")} autoComplete="address-level1" />
          <TextField label="ZIP code" value={v.address.postal_code} onChange={(e) => setAddr("postal_code", e.target.value)} autoComplete="postal-code" />
        </div>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField
          label="Time zone"
          placeholder="Choose a time zone"
          value={v.timezone}
          onChange={(e) => set("timezone", e.target.value)}
          options={tzOptions}
          error={fieldErr("timezone")}
        />
        <SelectField
          label="Fiscal year starts in"
          hint="Finance reports and budgets follow this."
          placeholder="Choose a month"
          value={v.fiscalMonth ? String(v.fiscalMonth) : ""}
          onChange={(e) => set("fiscalMonth", e.target.value ? Number(e.target.value) : null)}
          options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
          error={fieldErr("fiscal_year_start_month")}
        />
      </div>

      {err?.field === "form" || err?.field === "body" ? (
        <p role="alert" className="text-sm text-expense">{err.message}</p>
      ) : null}
      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-4">
        <Button type="submit" loading={busy}>{busy ? "Saving" : "Save"}</Button>
      </div>
    </form>
  );
}
