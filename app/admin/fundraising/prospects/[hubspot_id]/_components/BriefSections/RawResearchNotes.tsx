import { Fragment, type ReactNode } from "react";

/**
 * Minimal JSX-tree markdown renderer matching the pattern from PR Ops-2's
 * ProjectDescription. Handles headings (# ## ###), unordered lists,
 * paragraphs, inline bold, italic, code, links. Anything else falls
 * through as plain text. XSS-safe by construction — no dangerouslySetInnerHTML.
 */
function renderInline(text: string, baseKey: string): ReactNode[] {
  const re =
    /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\n]+\))/g;
  const out: ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
    const t = m[0];
    if (t.startsWith("`")) {
      out.push(
        <code
          key={`${baseKey}-${i++}`}
          className="px-1 py-0.5 rounded bg-tile text-ink-1 text-[12px] font-mono"
        >
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
        <h3 key={key++} className="text-sm font-semibold text-ink-1 mt-4 mb-1">
          {renderInline(line.slice(4), `h3-${key}`)}
        </h3>
      );
      i++;
    } else if (line.startsWith("## ")) {
      out.push(
        <h2 key={key++} className="text-base font-semibold text-ink-1 mt-5 mb-2">
          {renderInline(line.slice(3), `h2-${key}`)}
        </h2>
      );
      i++;
    } else if (line.startsWith("# ")) {
      out.push(
        <h1 key={key++} className="text-lg font-bold text-ink-1 mt-5 mb-2">
          {renderInline(line.slice(2), `h1-${key}`)}
        </h1>
      );
      i++;
    } else if (line.startsWith("- ")) {
      const items: ReactNode[] = [];
      let j = 0;
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(
          <li
            key={`li-${key}-${j}`}
            className="ml-5 list-disc text-ink-1 text-sm"
          >
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
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !lines[i].startsWith("# ") &&
        !lines[i].startsWith("## ") &&
        !lines[i].startsWith("### ") &&
        !lines[i].startsWith("- ")
      ) {
        para.push(lines[i]);
        i++;
      }
      const parts = para.flatMap((l, idx) => [
        ...renderInline(l, `p-${key}-${idx}`),
        idx < para.length - 1 ? <br key={`br-${key}-${idx}`} /> : null,
      ]);
      out.push(
        <p
          key={key++}
          className="text-sm text-ink-1 leading-relaxed my-2"
        >
          {parts.map((x, idx) =>
            x === null ? null : <Fragment key={idx}>{x}</Fragment>
          )}
        </p>
      );
    }
  }
  return out;
}

export default function RawResearchNotes({
  text,
  defaultOpen = false,
}: {
  text: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      {...(defaultOpen ? { open: true } : {})}
      className="rounded-card border-[1.5px] border-outline bg-black/30 p-6 group"
    >
      <summary className="cursor-pointer select-none text-xs uppercase tracking-wider text-ink-2 hover:text-ink-1">
        Raw research notes
      </summary>
      <div className="mt-4">
        {text && text.trim() ? (
          renderMarkdown(text)
        ) : (
          <p className="text-sm text-ink-2 italic">
            No raw notes logged for this brief.
          </p>
        )}
      </div>
    </details>
  );
}
