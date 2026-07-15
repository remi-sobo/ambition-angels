"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition, type ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Project description with view/edit toggle.
 *
 * Markdown rendering is intentionally minimal: headings (# / ## / ###),
 * unordered lists (-), paragraphs, plus inline bold (**), italic (*),
 * code (`), and links ([text](url)). Anything beyond that falls through
 * as plain text. No html lib, no client-side editor chrome.
 *
 * We render via JSX (no dangerouslySetInnerHTML), so user input is never
 * inserted as HTML — XSS-safe by construction.
 */

function renderInline(text: string, baseKey: string): ReactNode[] {
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\n]+\))/g;
  const out: ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
    const t = m[0];
    if (t.startsWith("`")) {
      out.push(
        <code key={`${baseKey}-${i++}`} className="px-1 py-0.5 rounded bg-tile text-ink-1 text-[12px] font-mono">
          {t.slice(1, -1)}
        </code>
      );
    } else if (t.startsWith("**")) {
      out.push(<strong key={`${baseKey}-${i++}`}>{t.slice(2, -2)}</strong>);
    } else if (t.startsWith("*")) {
      out.push(<em key={`${baseKey}-${i++}`}>{t.slice(1, -1)}</em>);
    } else {
      const link = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        out.push(
          <a
            key={`${baseKey}-${i++}`}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="text-orange hover:underline"
          >
            {link[1]}
          </a>
        );
      } else {
        out.push(t);
      }
    }
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out;
}

function renderMarkdown(md: string): ReactNode {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      out.push(
        <h3 key={key++} className="text-base font-semibold text-ink-1 mt-4 mb-2">
          {renderInline(line.slice(4), `h3-${key}`)}
        </h3>
      );
      i++;
    } else if (line.startsWith("## ")) {
      out.push(
        <h2 key={key++} className="text-lg font-semibold text-ink-1 mt-5 mb-2">
          {renderInline(line.slice(3), `h2-${key}`)}
        </h2>
      );
      i++;
    } else if (line.startsWith("# ")) {
      out.push(
        <h1 key={key++} className="text-xl font-bold text-ink-1 mt-5 mb-3">
          {renderInline(line.slice(2), `h1-${key}`)}
        </h1>
      );
      i++;
    } else if (line.startsWith("- ")) {
      const items: ReactNode[] = [];
      let j = 0;
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(
          <li key={`li-${key}-${j}`} className="ml-5 list-disc text-ink-1">
            {renderInline(lines[i].slice(2), `li-${key}-${j}`)}
          </li>
        );
        j++;
        i++;
      }
      out.push(
        <ul key={key++} className="my-2 space-y-1">
          {items}
        </ul>
      );
    } else if (line.trim() === "") {
      i++;
    } else {
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !lines[i].startsWith("# ") &&
        !lines[i].startsWith("## ") &&
        !lines[i].startsWith("### ") &&
        !lines[i].startsWith("- ")
      ) {
        paraLines.push(lines[i]);
        i++;
      }
      // Preserve internal line breaks within a paragraph.
      const parts = paraLines.flatMap((l, idx) => [
        ...renderInline(l, `p-${key}-${idx}`),
        idx < paraLines.length - 1 ? <br key={`br-${key}-${idx}`} /> : null,
      ]);
      out.push(
        <p key={key++} className="text-sm text-ink-1 leading-relaxed my-2">
          {parts.map((x, idx) => (x === null ? null : <Fragment key={idx}>{x}</Fragment>))}
        </p>
      );
    }
  }
  return out;
}

export default function ProjectDescription({
  projectId,
  description,
}: {
  projectId: string;
  description: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/ops/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: draft || null }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEditing(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(description ?? "");
    setEditing(false);
    setError(null);
  }

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className={TYPE.sectionHeader}>
          Description
        </h2>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-orange hover:underline"
          >
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={cancel}
              className="text-xs text-ink-2 hover:text-ink-1"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark disabled:opacity-50 px-3 py-1 rounded"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={12}
            placeholder="Project plan, in markdown. Headings with #, lists with -, **bold**, *italic*, `code`, [links](url)."
            className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-sm text-ink-1 placeholder-ink-3 font-mono focus:outline-none focus:border-orange/50"
          />
          {error && <p className="text-expense text-xs mt-2">{error}</p>}
          <div className="mt-4 pt-3 border-t border-hairline">
            <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">
              Preview
            </div>
            <div className="text-sm">
              {draft ? renderMarkdown(draft) : <span className="text-ink-2">Nothing yet.</span>}
            </div>
          </div>
        </>
      ) : description && description.trim() ? (
        <div>{renderMarkdown(description)}</div>
      ) : (
        <p className="text-sm text-ink-2 italic">No description yet. Click Edit to add one.</p>
      )}
    </section>
  );
}
