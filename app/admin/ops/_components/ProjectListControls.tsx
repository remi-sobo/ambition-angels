"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import FilterRow from "@/app/admin/_components/ui/FilterRow";
import Button from "@/app/admin/_components/ui/Button";
import Drawer from "@/app/admin/_components/ui/Drawer";
import { Select } from "@/app/admin/_components/ui/Input";
import { DateField, SelectField, TextField, TextareaField } from "@/app/admin/_components/ui/Field";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import { CATEGORIES, PROJECT_STATUSES, categoryLabel, type Category } from "../_types/ops";
import { useAssignees, withSelected } from "../../_lib/useAssignees";

/**
 * The projects list's filter row and its New project drawer (V4 Stage G).
 *
 * The URL is the state (lib/admin/ops/projectList.ts): search, status,
 * category, assignee and the grant-projects switch write their params and
 * paging resets. "New project" is the page's one primary action and opens
 * the kit Drawer (spec §5 Form: a drawer for anything under ten fields).
 */
export default function ProjectListControls({
  status,
  category,
  assignee,
  q,
  currentUser,
  showGrants,
}: {
  status: string;
  category: string;
  assignee: string;
  q: string;
  currentUser: string | null;
  showGrants: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const memberOptions = withSelected(useAssignees(), assignee === "me" || assignee === "unassigned" ? "" : assignee);
  const [text, setText] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setText(q), [q]);

  function go(updates: Record<string, string | null>) {
    const current: Record<string, string> = {};
    if (status && status !== "active") current.status = status;
    if (category) current.category = category;
    if (assignee) current.assignee = assignee;
    if (text.trim()) current.q = text.trim();
    if (showGrants) current.grants = "show";
    const merged = { ...current, ...updates };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v !== null && v !== "") params.set(k, v);
    const s = params.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  const onSearch = (v: string) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: v.trim() || null }), 300);
  };

  const active = (status && status !== "active" ? 1 : 0) + (category ? 1 : 0) + (assignee ? 1 : 0) + (showGrants ? 1 : 0);

  return (
    <FilterRow
      search={{ value: text, onChange: onSearch, label: "Search projects", placeholder: "Search by title" }}
      quickFilters={[
        {
          key: "grants",
          label: "Grant projects",
          active: showGrants,
          onClick: () => go({ grants: showGrants ? null : "show" }),
        },
        ...(assignee === "unassigned"
          ? [{ key: "unassigned", label: "Unassigned", active: true, onClick: () => go({ assignee: null }) }]
          : [{ key: "unassigned", label: "Unassigned", onClick: () => go({ assignee: "unassigned" }) }]),
      ]}
      onClearAll={
        active > 0 || q
          ? () => {
              setText("");
              router.replace(pathname, { scroll: false });
            }
          : undefined
      }
      right={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Status"
            value={status || "active"}
            onChange={(e) => go({ status: e.target.value === "active" ? null : e.target.value })}
            className="!w-auto"
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {categoryLabel(s)}
              </option>
            ))}
            <option value="all">Every status</option>
          </Select>
          <Select
            aria-label="Category"
            value={category}
            onChange={(e) => go({ category: e.target.value || null })}
            className="!w-auto"
          >
            <option value="">Any category</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Owner"
            value={assignee}
            onChange={(e) => go({ assignee: e.target.value || null })}
            className="!w-auto"
          >
            <option value="">Anyone</option>
            <option value="me">{currentUser ? `Me (${currentUser})` : "Me"}</option>
            {memberOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
            <option value="unassigned">Unassigned</option>
          </Select>
        </div>
      }
    />
  );
}

/** The page's primary action: New project, in the kit Drawer. */
export function NewProjectButton({ currentUser, basePath = "/admin/work/projects" }: { currentUser: string | null; basePath?: string }) {
  const router = useRouter();
  const save = useSaveAction();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [assignee, setAssignee] = useState<string>(currentUser ?? "");
  const options = withSelected(useAssignees(), assignee);
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the project a title.");
      return;
    }
    setError(null);
    setSaving(true);
    const r = await save<{ project: { id: string } }>({
      request: {
        url: "/api/admin/ops/projects",
        method: "POST",
        body: {
          title: title.trim(),
          category,
          assigned_to: assignee || null,
          due_date: dueDate || null,
          description: description || null,
        },
      },
      success: "Project created",
    });
    setSaving(false);
    if (!r.ok) return;
    setOpen(false);
    setTitle("");
    setDueDate("");
    setDescription("");
    router.push(`${basePath}/${r.data.project.id}`);
    router.refresh();
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        New project
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New project"
        description="A project groups tasks with a goal and an owner. Only the title is required."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-project-form" loading={saving}>
              {saving ? "Creating" : "Create project"}
            </Button>
          </>
        }
      >
        <form id="new-project-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
          <TextField
            className="col-span-2"
            label="Title"
            required
            autoFocus
            value={title}
            error={error ?? undefined}
            placeholder="Spring program launch"
            onChange={(e) => setTitle(e.target.value)}
          />
          <SelectField
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            options={CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
          />
          <SelectField
            label="Owner"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="Unassigned"
            options={options}
          />
          <DateField className="col-span-2" label="Due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <TextareaField
            className="col-span-2"
            label="Description"
            hint="Markdown is fine."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </form>
      </Drawer>
    </>
  );
}
