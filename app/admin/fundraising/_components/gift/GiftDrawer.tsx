"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Drawer from "@/app/admin/_components/ui/Drawer";
import Button from "@/app/admin/_components/ui/Button";
import Notice from "@/app/admin/_components/ui/Notice";
import { TextField, DateField, SelectField, TextareaField } from "@/app/admin/_components/ui/Field";
import { SkeletonBlock, SkeletonGroup } from "@/app/admin/_components/ui/Skeleton";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { TYPE } from "@/lib/admin/typeScale";
import {
  GIFT_METHODS,
  METHOD_LABEL,
  diffGift,
  giftDefaults,
  parseAmount,
  receiptEditNotice,
  type EditableField,
  type GiftPatch,
} from "@/lib/fundraising/giftEdit";
import { CHANNEL_PAST } from "@/lib/fundraising/ack-channels";

/**
 * Record a gift and its thank-you in one drawer (V4 B1, GiftFlow.dc.html;
 * spec §5 Form archetype, §9 "Record a gift and thank the donor").
 *
 * Opened from the donor record (donor prefilled), Donors & Funders (donor
 * picked here) and the thank-you rows on Today and Thank-yous (an existing
 * gift, in edit mode). Required fields first and few: amount, date, method.
 * Date defaults to today in the org's timezone and method to the donor's last
 * one, so recording a gift from a record is: type the amount, then one click.
 *
 * The one primary button saves the gift AND handles the thank-you the way the
 * existing pipeline does: "queue" leaves it to the org's thank-you rules (the
 * gift route runs stewardship: a task, or an automatic receipt only where the
 * org set one up); "already thanked" marks it through the same route as the
 * queue's Mark thanked. This drawer never sends an email itself.
 *
 * Edit mode: the same fields, the rules in lib/fundraising/giftEdit.ts
 * (synced gifts keep amount/date/method; a gift whose receipt went out gets a
 * Notice and nothing is resent; no delete here). Money is never optimistic:
 * the button shows the saving state and the page updates after the server
 * says yes.
 */

type Option = { id: string; name: string };
type FormData = {
  today: string;
  options: { funds: Option[]; campaigns: Option[]; appeals: Option[] };
  donor: { id: string; name: string; email: string | null; lastMethod: string | null; preferredAck: string | null } | null;
  gift: {
    id: string;
    constituent_id: string | null;
    amount: number;
    gift_date: string;
    method: string;
    fund_id: string | null;
    campaign_id: string | null;
    appeal_id: string | null;
    fair_market_value: number | null;
    notes: string | null;
    external_source: string | null;
    acknowledgment_status: string;
    acknowledged_at: string | null;
  } | null;
  receiptSent: boolean;
  lockedFields: EditableField[];
};

const MARK_CHANNELS: { value: string; label: string }[] = [
  { value: "letter", label: "Letter" },
  { value: "call", label: "Phone call" },
  { value: "text", label: "Text" },
  { value: "in_person", label: "In person" },
  { value: "email", label: "An email I sent myself" },
];

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 });
const shortDate = (iso: string) =>
  new Date((iso.length === 10 ? iso + "T00:00:00" : iso)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function GiftDrawer({
  open,
  onClose,
  constituentId,
  giftId,
  prefill,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Prefill the donor (opened from a record). */
  constituentId?: string;
  /** Edit this gift instead of recording a new one. */
  giftId?: string;
  /** V4 §8: a Talk to log gift card prefills a new gift. Nothing is saved
   *  until the person presses the drawer's own button. */
  prefill?: { amount?: number | null; date?: string | null; notes?: string | null; note?: string };
  /** Called with the new gift's id after the server saved it. */
  onSaved?: (giftId: string) => void;
}) {
  const router = useRouter();
  const save = useSaveAction();
  const toast = useToast();
  const editing = !!giftId;

  const [data, setData] = useState<FormData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Fields
  const [donor, setDonor] = useState<{ id: string | null; name: string }>({ id: null, name: "" });
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [method, setMethod] = useState<string>("check");
  const [fundId, setFundId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [appealId, setAppealId] = useState("");
  const [fmv, setFmv] = useState("");
  const [notes, setNotes] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [thanks, setThanks] = useState<"queue" | "mark">("queue");
  const [markChannel, setMarkChannel] = useState("letter");
  const [amountError, setAmountError] = useState("");

  // Load on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setData(null);
    setLoadError("");
    setError("");
    setAmountError("");
    const qs = new URLSearchParams();
    if (giftId) qs.set("gift_id", giftId);
    else if (constituentId) qs.set("constituent_id", constituentId);
    fetch(`/api/admin/gifts/form?${qs.toString()}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setLoadError(typeof j.error === "string" ? j.error : "The form could not load. Close it and try again.");
          return;
        }
        const d = j as FormData;
        setData(d);
        if (d.gift) {
          const g = d.gift;
          setAmount(String(g.amount));
          setDate(g.gift_date);
          setMethod(g.method);
          setFundId(g.fund_id ?? "");
          setCampaignId(g.campaign_id ?? "");
          setAppealId(g.appeal_id ?? "");
          setFmv(g.fair_market_value ? String(g.fair_market_value) : "");
          setNotes(g.notes ?? "");
          // Collapsed even when filled: the summary line says what is set, and
          // the thank-you section stays in view.
          setMoreOpen(false);
        } else {
          const defs = giftDefaults({ today: d.today, lastMethod: d.donor?.lastMethod });
          setAmount(prefill?.amount ? String(prefill.amount) : "");
          setDate(prefill?.date && prefill.date <= d.today ? prefill.date : defs.gift_date);
          setMethod(defs.method);
          setFundId("");
          setCampaignId("");
          setAppealId("");
          setFmv("");
          setNotes(prefill?.notes ?? "");
          setMoreOpen(false);
        }
        setDonor(d.donor ? { id: d.donor.id, name: d.donor.name } : { id: null, name: "" });
        setThanks("queue");
        const pref = d.donor?.preferredAck;
        setMarkChannel(pref && MARK_CHANNELS.some((c) => c.value === pref) ? pref : "letter");
      })
      .catch(() => {
        if (!cancelled) setLoadError("The form could not load. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
    // prefill is read when the drawer opens; its fields are the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, giftId, constituentId, prefill?.amount, prefill?.date, prefill?.notes]);

  const locked = new Set(data?.lockedFields ?? []);
  const defaults = data ? giftDefaults({ today: data.today, lastMethod: data.donor?.lastMethod }) : null;
  const ackPending = !editing || data?.gift?.acknowledgment_status === "pending";
  const parsedAmount = parseAmount(amount);

  // The patch this form would send in edit mode, and what it changes.
  const patch: GiftPatch = useMemo(() => {
    const p: GiftPatch = {};
    if (parsedAmount !== null) p.amount = parsedAmount;
    if (date) p.gift_date = date;
    p.method = method;
    p.fund_id = fundId || null;
    p.campaign_id = campaignId || null;
    p.appeal_id = appealId || null;
    p.fair_market_value = fmv ? Number(fmv) || null : null;
    p.notes = notes || null;
    return p;
  }, [parsedAmount, date, method, fundId, campaignId, appealId, fmv, notes]);
  const changed = editing && data?.gift ? diffGift(data.gift, patch).changed : [];
  const notice = editing ? receiptEditNotice(!!data?.receiptSent, changed) : null;

  const primaryLabel = editing
    ? changed.length === 0 && thanks === "mark" && ackPending
      ? "Mark thanked"
      : thanks === "mark" && ackPending
        ? "Save and mark thanked"
        : "Save changes"
    : thanks === "mark"
      ? "Save gift and mark thanked"
      : "Save gift and queue thank-you";

  async function markThanked(id: string): Promise<"ok" | "already" | "failed"> {
    const r = await save({
      request: { url: "/api/admin/acknowledgments/mark", method: "POST", body: { gift_id: id, channel: markChannel } },
      failure: false,
    });
    if (r.ok) return "ok";
    return r.status === 409 ? "already" : "failed";
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!data || saving) return;
    setError("");
    if (parsedAmount === null) {
      setAmountError("Enter an amount greater than zero, like 250 or 1,250.50.");
      return;
    }
    setAmountError("");
    if (!editing && !donor.id && !donor.name.trim()) {
      setError("Pick the donor this gift is from.");
      return;
    }
    setSaving(true);
    try {
      if (editing && data.gift) {
        const giftIdNow = data.gift.id;
        if (changed.length > 0) {
          // Never optimistic: money waits for the server.
          // Send only what changed (plus the FMV when the amount moves, so the
          // deductible part is recomputed on the server).
          const body: Record<string, unknown> = Object.fromEntries(changed.map((f) => [f, patch[f]]));
          if (changed.includes("amount") && patch.fair_market_value) body.fair_market_value = patch.fair_market_value;
          const r = await save<{ ok: true; changed: string[] }>({
            request: { url: `/api/admin/gifts/${giftIdNow}`, method: "PATCH", body },
            failure: false,
          });
          if (!r.ok) {
            setError(r.message);
            return;
          }
        }
        let thanked = "";
        if (thanks === "mark" && ackPending) {
          const m = await markThanked(giftIdNow);
          thanked = m === "ok" ? " Marked thanked." : m === "already" ? " It was already thanked." : " The thank-you could not be marked; it stays in the queue.";
        }
        toast.success(`${changed.length > 0 ? "Gift updated." : "No changes to the gift."}${thanked}`);
      } else {
        const r = await save<{ id: string; warning?: string }>({
          request: {
            url: "/api/admin/gifts",
            method: "POST",
            body: {
              ...(donor.id ? { constituent_id: donor.id } : { constituent_name: donor.name.trim() }),
              amount: parsedAmount,
              gift_date: date,
              method,
              fund_id: fundId || undefined,
              campaign_id: campaignId || undefined,
              appeal_id: appealId || undefined,
              fair_market_value: fmv ? Number(fmv) : undefined,
              notes: notes || undefined,
            },
          },
          failure: false,
        });
        if (!r.ok) {
          setError(r.message);
          return;
        }
        let tail = " Thank-you queued.";
        if (thanks === "mark") {
          const m = await markThanked(r.data.id);
          tail =
            m === "ok"
              ? " Marked thanked."
              : m === "already"
                ? " Your thank-you rules already thanked them."
                : " The gift is saved, but the thank-you could not be marked. It is in the queue.";
        }
        toast.success(`Gift of ${usd(parsedAmount)} recorded.${tail}`);
        if (r.data.warning) toast.info(r.data.warning);
        onSaved?.(r.data.id);
      }
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const title = editing ? "Edit gift" : "Record a gift";
  const description = editing
    ? data?.donor
      ? `From ${data.donor.name}.`
      : "Change what was entered."
    : data?.donor
      ? `From ${data.donor.name}. Only amount and date are required.`
      : "Only the donor, amount and date are required.";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button type="button" variant="secondary" size="lg" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="gift-drawer-form" size="lg" loading={saving} disabled={!data || saving}>
            {saving ? "Saving" : primaryLabel}
          </Button>
        </>
      }
    >
      {loadError ? (
        <Notice tone="danger" title="This form could not load.">
          {loadError}
        </Notice>
      ) : !data ? (
        <SkeletonGroup label="Loading the gift form">
          <SkeletonBlock className="h-11 w-full mb-4" />
          <SkeletonBlock className="h-11 w-full mb-4" />
          <SkeletonBlock className="h-24 w-full" />
        </SkeletonGroup>
      ) : (
        <form id="gift-drawer-form" onSubmit={submit} className="grid gap-4" noValidate>
          {prefill?.note && !editing ? (
            <Notice tone="info" title="Drafted from your recording.">
              {prefill.note}
            </Notice>
          ) : null}
          {error ? (
            <Notice tone="danger" title="Not saved.">
              {error}
            </Notice>
          ) : null}
          {notice ? (
            <Notice tone={notice.tone} title={notice.title}>
              {notice.body}
            </Notice>
          ) : null}
          {editing && locked.size > 0 ? (
            <Notice tone="info" title={`This gift came from ${data.gift?.external_source}.`}>
              Its amount, date and method are set there and would sync back, so they are locked here. Fund, campaign,
              appeal and notes can still change.
            </Notice>
          ) : null}

          {!editing && !data.donor ? <DonorPicker value={donor} onChange={setDonor} /> : null}

          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Amount ($)"
              required
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={amountError || undefined}
              disabled={locked.has("amount")}
              autoFocus={!editing && !!data.donor}
            />
            <DateField
              label="Date"
              required
              value={date}
              max={data.today}
              onChange={(e) => setDate(e.target.value)}
              hint={!editing && date === data.today ? "Today, Pacific time" : undefined}
              disabled={locked.has("gift_date")}
            />
          </div>

          <div role="radiogroup" aria-labelledby="gift-method-label" className="flex flex-col gap-1.5">
            <span id="gift-method-label" className={TYPE.fieldLabel}>
              Payment method
            </span>
            <div className="grid grid-cols-4 sm:grid-cols-7 border border-outline rounded-control overflow-hidden">
              {GIFT_METHODS.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={method === m}
                  disabled={locked.has("method")}
                  onClick={() => setMethod(m)}
                  className={`h-11 px-1 text-sm ${i > 0 ? "border-l border-hairline" : ""} ${
                    method === m ? "bg-ink-1 text-surface font-semibold" : "bg-surface text-ink-1 hover:bg-tile"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
            {!editing && defaults?.methodHint && method === defaults.method ? (
              <span className={TYPE.metadata}>{defaults.methodHint}</span>
            ) : null}
          </div>

          <div className="border-t border-hairline pt-3">
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
              className="flex w-full items-center justify-between min-h-[44px] text-left"
            >
              <span className={`${TYPE.body} font-semibold`}>Fund, campaign and notes</span>
              <span className={`${TYPE.metadata} text-right truncate max-w-[60%]`}>
                {moreOpen
                  ? "Hide"
                  : [
                      data.options.funds.find((o) => o.id === fundId)?.name,
                      data.options.campaigns.find((o) => o.id === campaignId)?.name,
                      data.options.appeals.find((o) => o.id === appealId)?.name,
                      fmv ? "Fair market value set" : null,
                      notes ? "Has a note" : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "Optional"}
              </span>
            </button>
            {moreOpen ? (
              <div className="grid gap-4 pt-2">
                {data.options.funds.length > 0 ? (
                  <SelectField
                    label="Fund"
                    placeholder="No fund"
                    value={fundId}
                    onChange={(e) => setFundId(e.target.value)}
                    options={data.options.funds.map((o) => ({ value: o.id, label: o.name }))}
                  />
                ) : null}
                {data.options.campaigns.length > 0 ? (
                  <SelectField
                    label="Campaign"
                    placeholder="No campaign"
                    value={campaignId}
                    onChange={(e) => setCampaignId(e.target.value)}
                    options={data.options.campaigns.map((o) => ({ value: o.id, label: o.name }))}
                  />
                ) : null}
                {data.options.appeals.length > 0 ? (
                  <SelectField
                    label="Appeal"
                    placeholder="No appeal"
                    value={appealId}
                    onChange={(e) => setAppealId(e.target.value)}
                    options={data.options.appeals.map((o) => ({ value: o.id, label: o.name }))}
                  />
                ) : null}
                {method === "in_kind" || method === "stock" || fmv ? (
                  <TextField
                    label="Fair market value of goods or services given ($)"
                    hint="For a gift with a benefit in return. The deductible part is the amount minus this."
                    inputMode="decimal"
                    value={fmv}
                    onChange={(e) => setFmv(e.target.value)}
                  />
                ) : null}
                <TextareaField label="Notes" hint="Optional. Shows with the gift." rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            ) : null}
          </div>

          <div className="border-t border-hairline pt-4 grid gap-3">
            <h3 className={TYPE.subsectionTitle}>Thank-you</h3>
            {editing && !ackPending ? (
              <p className={TYPE.bodyMuted}>
                {data.gift?.acknowledgment_status === "sent"
                  ? `Thanked${data.gift.acknowledged_at ? ` on ${shortDate(data.gift.acknowledged_at)}` : ""}.`
                  : "No thank-you is needed for this gift."}
              </p>
            ) : (
              <fieldset className="grid gap-2">
                <legend className="sr-only">What to do about the thank-you</legend>
                <ThanksOption
                  name="gift-thanks"
                  checked={thanks === "queue"}
                  onChange={() => setThanks("queue")}
                  title={editing ? "Leave it in the thank-you queue" : "Add to the thank-you queue"}
                  hint={
                    editing
                      ? "Send or log it later from Thank-yous."
                      : "Your thank-you rules decide the rest: a task in the queue, or a receipt only where your organization set one up."
                  }
                />
                <ThanksOption
                  name="gift-thanks"
                  checked={thanks === "mark"}
                  onChange={() => setThanks("mark")}
                  title="Already thanked"
                  hint="Mark it thanked now. Nothing is sent."
                />
                {thanks === "mark" ? (
                  <SelectField
                    label="How you thanked them"
                    value={markChannel}
                    onChange={(e) => setMarkChannel(e.target.value)}
                    options={MARK_CHANNELS}
                    hint={markChannel ? `Shows on the timeline as "${CHANNEL_PAST[markChannel] ?? "Thanked"}".` : undefined}
                  />
                ) : null}
              </fieldset>
            )}
          </div>
        </form>
      )}
    </Drawer>
  );
}

function ThanksOption({
  name,
  checked,
  onChange,
  title,
  hint,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  hint: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-control cursor-pointer ${
        checked ? "border-2 border-ink-1" : "border border-outline"
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5 w-4 h-4 accent-[color:var(--text-primary)]" />
      <span>
        <span className="block font-semibold text-sm text-ink-1">{title}</span>
        <span className={`block ${TYPE.bodyMuted} text-[13px]`}>{hint}</span>
      </span>
    </label>
  );
}

/** Pick an existing donor (preferred: no duplicates), or name a new one. */
function DonorPicker({
  value,
  onChange,
}: {
  value: { id: string | null; name: string };
  onChange: (v: { id: string | null; name: string }) => void;
}) {
  const [results, setResults] = useState<Array<{ id: string; name: string; email: string | null }>>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (value.id) return;
    const q = value.name.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/constituents/search?q=${encodeURIComponent(q)}`);
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        const list = Array.isArray(j.results)
          ? (j.results as Array<{ kind: string; id: string; name: string; email: string | null }>).filter((x) => x.kind === "constituent")
          : [];
        setResults(list.map((x) => ({ id: x.id, name: x.name, email: x.email })));
        setSearched(true);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value.id, value.name]);

  if (value.id) {
    return (
      <div className="flex items-center justify-between gap-3 p-3 rounded-control border border-outline">
        <span>
          <span className={TYPE.fieldLabel}>Donor</span>
          <span className="block font-semibold text-sm text-ink-1">{value.name}</span>
        </span>
        <Button
          type="button"
          variant="quiet"
          size="md"
          onClick={() => {
            onChange({ id: null, name: "" });
            requestAnimationFrame(() => document.getElementById("gift-donor-search")?.focus());
          }}
        >
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <TextField
        id="gift-donor-search"
        label="Donor"
        required
        autoFocus
        autoComplete="off"
        placeholder="Search by name"
        value={value.name}
        onChange={(e) => onChange({ id: null, name: e.target.value })}
        hint="Pick someone already on your list so the gift joins their record."
      />
      {results.length > 0 ? (
        <ul aria-label="Matching donors" className="border border-outline rounded-control divide-y divide-hairline overflow-hidden">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onChange({ id: r.id, name: r.name })}
                className="flex w-full flex-col items-start min-h-[44px] px-3 py-2 text-left hover:bg-tile focus-visible:bg-tile"
              >
                <span className="text-sm font-semibold text-ink-1">{r.name}</span>
                {r.email ? <span className={TYPE.metadata}>{r.email}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : searched ? (
        <p className={TYPE.metadata}>No one on your list matches. Saving adds &ldquo;{value.name.trim()}&rdquo; as a new donor.</p>
      ) : null}
    </div>
  );
}
