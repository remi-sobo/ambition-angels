"use client";

// A textarea with lightweight @mention autocomplete. Typing "@" + letters
// opens a dropdown of org members (passed in); picking one inserts
// "@Display Name ". Resolution of who actually gets notified happens
// server-side from the body — this is only an input affordance.

import { useRef, useState } from "react";

export type Mentionable = { userId: string; displayName: string };

export function MentionTextarea({
  value,
  onChange,
  members,
  placeholder,
  rows = 2,
  autoFocus,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  members: Mentionable[];
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(-1); // index of the '@' that opened the menu
  const [hi, setHi] = useState(0);

  const matches = open
    ? members
        .filter((m) => m.displayName.toLowerCase().startsWith(query.toLowerCase()))
        .slice(0, 6)
    : [];

  // Is the cursor sitting in an "@token" (start-or-whitespace then @word)?
  const recompute = (text: string, caret: number) => {
    const m = text.slice(0, caret).match(/(?:^|\s)@(\w*)$/);
    if (m) {
      setAt(caret - m[1].length - 1);
      setQuery(m[1]);
      setOpen(true);
      setHi(0);
    } else {
      setOpen(false);
    }
  };

  const pick = (m: Mentionable) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    if (at < 0) return;
    const insert = `@${m.displayName} `;
    const next = value.slice(0, at) + insert + value.slice(caret);
    onChange(next);
    setOpen(false);
    const pos = at + insert.length;
    requestAnimationFrame(() => {
      if (el) { el.focus(); el.setSelectionRange(pos, pos); }
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          recompute(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % matches.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + matches.length) % matches.length); }
          else if (e.key === "Enter") { e.preventDefault(); pick(matches[hi]); }
          else if (e.key === "Escape") { setOpen(false); }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className={className}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 left-2 top-full mt-1 min-w-[12rem] bg-surface border-[1.5px] border-outline rounded-lg shadow-lg overflow-hidden">
          {matches.map((m, i) => (
            <li key={m.userId}>
              <button
                type="button"
                // onMouseDown (not onClick) so the pick fires before the
                // textarea blur closes the menu.
                onMouseDown={(e) => { e.preventDefault(); pick(m); }}
                className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
                  i === hi ? "bg-orange-light text-orange-dark" : "text-ink-1 hover:bg-tile"
                }`}
              >
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-light text-orange-dark text-[10px] font-bold">
                  {m.displayName[0]?.toUpperCase()}
                </span>
                {m.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
