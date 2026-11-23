"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import Button from "@/app/admin/_components/ui/Button";
import { TextField } from "@/app/admin/_components/ui/Field";

// V4 Stage F: Settings → Terms. One row per word; blank means BloomOS's own
// word. One save for the section; the page re-reads after it.

type Row = { key: string; builtIn: string; names: string; value: string };

export default function TermsForm({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const save = useSaveAction();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await save({
      request: { url: "/api/admin/settings/terms", method: "PUT", body: { terms: values } },
      success: "Your words are saved. Menus and pages use them now.",
      failure: false,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-panel border border-hairline bg-surface" aria-labelledby="terms-h">
      <div className="px-5 pt-5">
        <h2 id="terms-h" className="text-[17px] font-semibold text-ink-1">Your words</h2>
        <p className="text-sm text-ink-2 mt-0.5">Write each word singular, like &ldquo;Youth&rdquo; or &ldquo;Chapter&rdquo;. BloomOS adds the plural. Leave a box empty to keep the BloomOS word shown in it.</p>
      </div>
      <ul className="mt-3 divide-y divide-outline border-t border-hairline">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-2 sm:gap-6 px-5 py-4 items-start">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-1">{r.builtIn}</p>
              <p className="text-sm text-ink-2">{r.names}</p>
            </div>
            <TextField
              label={`Your word for ${r.builtIn.toLowerCase()}`}
              value={values[r.key] ?? ""}
              placeholder={r.builtIn}
              maxLength={40}
              controlSize="md"
              onChange={(e) => setValues((v) => ({ ...v, [r.key]: e.target.value }))}
            />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-3 border-t border-hairline px-5 py-4">
        {error ? <p role="alert" className="text-sm text-expense mr-auto">{error}</p> : null}
        <Button type="submit" loading={busy}>{busy ? "Saving" : "Save"}</Button>
      </div>
    </form>
  );
}
