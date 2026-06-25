"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentEntity } from "./RailEntityContext";
import { useReed } from "./reed/ReedProvider";

/**
 * Capture — the fast lane. No AI, instant, always saves, auto-linked to whatever
 * the context chip is showing. Optimistic (the input clears immediately) but
 * confirmed-persisted: a save that fails after retries surfaces in a retry shelf
 * with the exact text, so a captured thought is never silently dropped.
 */
type Failure = { key: string; title: string };

export default function CaptureBox({ onReport }: { onReport: () => void }) {
  const router = useRouter();
  const entity = useCurrentEntity();
  const { summon } = useReed();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [failures, setFailures] = useState<Failure[]>([]);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keySeq = useRef(0);

  function flashSaved() {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2200);
  }

  async function save(title: string): Promise<boolean> {
    const payload = entity
      ? { title, linked_entity_type: entity.type, linked_entity_id: entity.id, linked_label: entity.label }
      : { title };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch("/api/admin/rail/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (r.ok) return true;
        if (r.status === 400) return false; // bad input won't fix on retry
      } catch {
        /* network blip — retry */
      }
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
    return false;
  }

  async function commit(title: string) {
    const t = title.trim();
    if (!t) return;
    const ok = await save(t);
    if (ok) {
      flashSaved();
      router.refresh(); // pick the new task up in shelves / linked entity lists
    } else {
      setFailures((f) => [...f, { key: `f${keySeq.current++}`, title: t }]);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = text;
    setText(""); // optimistic clear — failures resurface in the retry shelf
    void commit(t);
  }

  function retry(f: Failure) {
    setFailures((cur) => cur.filter((x) => x.key !== f.key));
    void commit(f.title);
  }

  return (
    <div className="border-t border-hairline bg-app px-4 py-3.5">
      {failures.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {failures.map((f) => (
            <li
              key={f.key}
              className="flex items-center gap-2 rounded-lg bg-status-watch-bg px-2.5 py-1.5"
            >
              <span className="text-[12px] text-status-watch-text truncate min-w-0 flex-1">
                Couldn&rsquo;t save &ldquo;{f.title}&rdquo;
              </span>
              <button
                onClick={() => retry(f)}
                className="text-[12px] font-semibold text-status-watch-text hover:underline flex-shrink-0"
              >
                Retry
              </button>
              <button
                onClick={() => setFailures((cur) => cur.filter((x) => x.key !== f.key))}
                aria-label="Dismiss"
                className="text-[14px] leading-none text-status-watch-text/60 hover:text-status-watch-text flex-shrink-0"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Context chip + saved tick. Fixed height so the dock doesn't jump. */}
      <div className="flex items-center justify-between h-5 mb-1.5">
        {entity ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-tile border border-outline px-2 py-0.5 text-[11px] text-ink-2 max-w-[80%]">
            <span aria-hidden>↳</span>
            <span className="truncate">on: {entity.label}</span>
          </span>
        ) : (
          <span />
        )}
        {saved && (
          <span className="inline-flex items-center gap-1 text-[11px] text-status-healthy" aria-live="polite">
            <CheckIcon /> saved
          </span>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 rounded-xl bg-tile border border-hairline px-3 py-2.5 transition-colors focus-within:border-orange/50"
      >
        <PlusIcon />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Capture a task…"
          aria-label="Capture a task"
          className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-ink-1 placeholder-ink-3"
        />
        {/* Always-show escalation (open decision #4): a question or multi-step
            ask goes to Reed; the typed text rides along as the draft and is left
            in place so nothing is lost if Reed is dismissed. */}
        <button
          type="button"
          onClick={() => summon(text.trim())}
          aria-label="Ask Reed"
          className="flex-shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-orange hover:text-orange-dark transition-colors"
        >
          <Sparkle /> Ask Reed
        </button>
      </form>

      <div className="mt-1.5 px-0.5">
        <button
          type="button"
          onClick={onReport}
          className="text-[11px] text-ink-3 hover:text-ink-2 transition-colors"
        >
          Report an issue
        </button>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-ink-3 flex-shrink-0" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function Sparkle() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
