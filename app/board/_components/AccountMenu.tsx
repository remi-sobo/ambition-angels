"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { C, F } from "./tokens";

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** Avatar + sign-out. No "Chair controls" toggle: chair powers follow the
 *  role, so there is nothing here that changes what the product does. */
export default function AccountMenu({ name, roleLine }: { name: string; roleLine: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    await fetch("/api/board/signout", { method: "POST" }).catch(() => {});
    router.replace("/board/signin");
    router.refresh();
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          background: "none",
          border: "none",
          padding: "4px 2px",
          font: "inherit",
        }}
      >
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            background: C.ink,
            color: C.cream,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          {initials(name)}
        </span>
        <span
          style={{
            fontSize: 17,
            fontWeight: 500,
            color: C.ink,
            whiteSpace: "nowrap",
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: 52,
            right: 0,
            width: 260,
            background: C.white,
            border: `1px solid ${C.rule}`,
            borderRadius: 12,
            padding: 8,
            boxShadow: "0 8px 24px rgba(14,14,14,0.08)",
          }}
        >
          <div style={{ padding: "12px 12px 10px" }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: C.ink, fontFamily: F.body }}>{name}</div>
            <div style={{ fontSize: 15, color: C.muted }}>{roleLine}</div>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            style={{
              width: "100%",
              textAlign: "left",
              padding: 12,
              borderTop: `1px solid ${C.rule}`,
              border: "none",
              borderTopStyle: "solid",
              background: "none",
              fontSize: 17,
              fontWeight: 500,
              color: C.ink,
              cursor: "pointer",
              borderRadius: 6,
              fontFamily: F.body,
            }}
          >
            {busy ? "Signing out" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
