"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import type { FinCategory } from "@/lib/finance/types";
import PageHeader from "@/app/admin/_components/PageHeader";
import Button from "@/app/admin/_components/ui/Button";
import Drawer from "@/app/admin/_components/ui/Drawer";
import Notice from "@/app/admin/_components/ui/Notice";
import { Checkbox } from "@/app/admin/_components/ui/Input";
import { SelectField, TextField } from "@/app/admin/_components/ui/Field";
import DataTable, { type DataTableColumn } from "@/app/admin/_components/ui/DataTable";
import CategoryOptions from "../../_components/CategoryOptions";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";

type Rule = {
  id: string;
  pattern: string;
  pattern_type: "contains" | "starts_with" | "regex";
  category_id: string;
  restricted: boolean;
  priority: number;
  enabled: boolean;
  hit_count: number;
};

type Props = {
  initialRules: Rule[];
  categories: FinCategory[];
  /** Header copy, from the server page. */
  subtitle: string;
};

const PATTERN_TYPES: Array<{ value: Rule["pattern_type"]; label: string }> = [
  { value: "contains", label: "Contains" },
  { value: "starts_with", label: "Starts with" },
  { value: "regex", label: "Matches a pattern (regex)" },
];
const typeLabel = (t: Rule["pattern_type"]) => PATTERN_TYPES.find((p) => p.value === t)?.label ?? t;

const SPEC = { sortable: [], defaultSort: null, pageSize: 1000 } as const;

type Draft = { pattern: string; pattern_type: Rule["pattern_type"]; category_id: string; priority: number };
const EMPTY: Draft = { pattern: "", pattern_type: "contains", category_id: "", priority: 0 };

// Category rules (V4 Stage G2, the Settings archetype): one primary action
// (Add a rule) opening the kit Drawer, which also edits; seeding defaults and
// re-applying sit in More actions; the list is DataTable v2. Every write goes
// through saveAction. Turning a rule on or off is optimistic (harmless to
// roll back); creating, editing and deleting wait for the server.
export default function RulesEditor({ initialRules, categories, subtitle }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const save = useSaveAction();
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const catById = new Map(categories.map((c) => [c.id, c]));

  function openAdd() {
    setDraft(EMPTY);
    setFormError(null);
    setDrawer({ open: true, id: null });
  }
  function openEdit(r: Rule) {
    setDraft({ pattern: r.pattern, pattern_type: r.pattern_type, category_id: r.category_id, priority: r.priority });
    setFormError(null);
    setDrawer({ open: true, id: r.id });
  }
  const close = () => setDrawer({ open: false, id: null });

  async function submit() {
    if (!draft.pattern.trim() || !draft.category_id) {
      setFormError("Pattern and category are required.");
      return;
    }
    setBusy(true);
    setFormError(null);
    const editing = drawer.id;
    const r = await save<{ rule: Rule }>({
      request: editing
        ? {
            url: `/api/admin/finance/rules/${editing}`,
            method: "PATCH",
            body: { pattern: draft.pattern.trim(), pattern_type: draft.pattern_type, category_id: draft.category_id, priority: draft.priority },
          }
        : {
            url: "/api/admin/finance/rules",
            method: "POST",
            body: { pattern: draft.pattern, pattern_type: draft.pattern_type, category_id: draft.category_id },
          },
      success: editing ? "Rule saved" : "Rule added",
      failure: false,
    });
    setBusy(false);
    if (!r.ok) {
      setFormError(r.message);
      return;
    }
    setRules((rs) => (editing ? rs.map((x) => (x.id === editing ? { ...x, ...r.data.rule } : x)) : [r.data.rule, ...rs]));
    close();
  }

  async function toggle(id: string, enabled: boolean) {
    await save({
      request: { url: `/api/admin/finance/rules/${id}`, method: "PATCH", body: { enabled } },
      optimistic: () => setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled } : r))),
      rollback: () => setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r))),
    });
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: "Delete this rule?",
      body: "Transactions it already matched keep their category.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const r = await save({ request: { url: `/api/admin/finance/rules/${id}`, method: "DELETE" }, success: "Rule deleted" });
    if (r.ok) setRules((rs) => rs.filter((x) => x.id !== id));
  }

  async function applyAll() {
    setBusy(true);
    setResult(null);
    const r = await save<{ matched: number; considered: number; remaining?: number }>({
      request: { url: "/api/admin/finance/rules/apply-all", method: "POST" },
    });
    setBusy(false);
    if (!r.ok) return;
    setResult(
      `Categorized ${r.data.matched} of ${r.data.considered} uncategorized transactions. ${r.data.remaining ?? 0} still need a category.`,
    );
    router.refresh();
  }

  // Seed defaults: about 60 starter rules from common bank descriptions.
  // Idempotent: skips patterns already present.
  async function seedDefaults() {
    setBusy(true);
    setResult(null);
    const r = await save<{ inserted: number; skipped: number }>({
      request: { url: "/api/admin/finance/rules/seed", method: "POST" },
    });
    setBusy(false);
    if (!r.ok) return;
    setResult(
      r.data.inserted === 0
        ? `The default rules are already in (${r.data.skipped} present).`
        : `Added ${r.data.inserted} default rules (${r.data.skipped} already present). Apply them to uncategorized transactions to backfill.`,
    );
    router.refresh();
  }

  const sorted = [...rules].sort((a, b) => b.priority - a.priority);

  const columns: DataTableColumn<Rule>[] = [
    {
      key: "pattern",
      header: "When the description",
      card: "title",
      render: (r) => (
        <span className={r.enabled ? "" : "opacity-60"}>
          <span className="text-ink-2">{typeLabel(r.pattern_type)} </span>
          <span className="font-mono text-ink-1 font-semibold">{r.pattern}</span>
        </span>
      ),
    },
    {
      key: "category",
      header: "Set the category to",
      render: (r) => (
        <span className="text-ink-1">
          {catById.get(r.category_id)?.display_name ?? r.category_id}
          <span className="text-xs text-ink-2 ml-1.5">{catById.get(r.category_id)?.group_name}</span>
        </span>
      ),
    },
    { key: "hits", header: "Matches", align: "right", className: "tabular-nums", render: (r) => r.hit_count },
    { key: "priority", header: "Priority", align: "right", className: "tabular-nums", render: (r) => r.priority },
    {
      key: "on",
      header: "On",
      render: (r) => (
        <label className="inline-flex items-center gap-2 min-h-[32px] text-[13px] text-ink-2 cursor-pointer">
          <Checkbox checked={r.enabled} onChange={(e) => toggle(r.id, e.target.checked)} />
          <span className="sr-only">Rule {r.pattern} is </span>
          {r.enabled ? "On" : "Off"}
        </label>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (r) => (
        <span className="inline-flex gap-1">
          <Button size="sm" variant="quiet" onClick={() => openEdit(r)} aria-label={`Edit rule ${r.pattern}`}>
            Edit
          </Button>
          <Button size="sm" variant="quiet" onClick={() => void remove(r.id)} aria-label={`Delete rule ${r.pattern}`}>
            Delete
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Settings", href: "/admin/settings" },
          { label: "Finance", href: "/admin/settings/finance" },
        ]}
        title="Category rules"
        subtitle={subtitle}
        moreActions={[
          { label: "Apply rules to uncategorized", onSelect: () => void applyAll(), disabled: busy },
          { label: "Add the default rules", onSelect: () => void seedDefaults(), disabled: busy, hint: "About 60 starter rules; skips ones you have" },
          { label: "Uncategorized transactions", href: "/admin/finance/transactions?category=uncategorized" },
        ]}
        primaryAction={<Button onClick={openAdd}>Add a rule</Button>}
      />

      {result ? (
        <Notice tone="success" title="Done." className="mb-4">
          {result}
        </Notice>
      ) : null}

      <DataTable
        label="Category rules"
        noun={{ one: "rule", many: "rules" }}
        columns={columns}
        data={{ rows: sorted, total: sorted.length, page: 0, pageSize: SPEC.pageSize }}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.pattern}
        spec={SPEC}
        state={{ page: 0, sort: null }}
        baseHref="/admin/settings/finance/rules"
        emptyMessage={
          <>
            No rules yet. Add one, for example: contains <span className="font-mono text-ink-1">GUSTO</span>, set to Salaries
            and wages.
          </>
        }
      />

      <Drawer
        open={drawer.open}
        onClose={close}
        title={drawer.id ? "Edit rule" : "Add a rule"}
        description="Rules run on every import and on demand. The highest priority match wins."
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy} disabled={!draft.pattern.trim() || !draft.category_id}>
              {drawer.id ? "Save rule" : "Add rule"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {formError ? (
            <Notice tone="danger" title="Not saved.">
              {formError}
            </Notice>
          ) : null}
          <SelectField
            label="Match when the description"
            value={draft.pattern_type}
            onChange={(e) => setDraft((d) => ({ ...d, pattern_type: e.target.value as Rule["pattern_type"] }))}
            options={PATTERN_TYPES}
          />
          <TextField
            label="Text to look for"
            required
            value={draft.pattern}
            onChange={(e) => setDraft((d) => ({ ...d, pattern: e.target.value }))}
            placeholder={draft.pattern_type === "regex" ? "^ADP .*PAYROLL" : draft.pattern_type === "starts_with" ? "WF DIRECT PAY" : "GUSTO"}
            hint={draft.pattern_type === "regex" ? "A broken pattern is skipped at import, never fatal." : undefined}
          />
          <SelectField
            label="Set the category to"
            required
            value={draft.category_id}
            onChange={(e) => setDraft((d) => ({ ...d, category_id: e.target.value }))}
            placeholder="Choose a category"
          >
            <CategoryOptions categories={categories} />
          </SelectField>
          {drawer.id ? (
            <TextField
              label="Priority"
              type="number"
              step="1"
              value={draft.priority}
              hint="Higher runs first."
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setDraft((d) => ({ ...d, priority: Number.isNaN(n) ? 0 : n }));
              }}
            />
          ) : null}
        </div>
      </Drawer>
    </>
  );
}
