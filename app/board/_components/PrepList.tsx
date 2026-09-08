"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { PrepItem } from "@/lib/board/data";
import { C, F, card } from "./tokens";

/**
 * "Before Wednesday" (spec §5.2).
 *
 * Completion is per-director and is NEVER shown to another director — this
 * component only ever receives the signed-in director's own rows, and RLS
 * enforces the same thing a layer down.
 *
 * Row 1 is the primary action and the rest are secondary: the V2 audit's
 * Hick's-law finding was that four identically-weighted buttons hide the fact
 * that reading the brief is the only item that changes how a director votes.
 */
export default function PrepList({ meetingId, items }: { meetingId: string; items: PrepItem[] }) {
  const [rows, setRows] = useState(items);
  const [, startTransition] = useTransition();

  const done = rows.filter((r) => r.completed_at).length;
  const minutesLeft = rows.filter((r) => !r.completed_at).reduce((a, r) => a + (r.minutes_est ?? 0), 0);
  const firstOpen = rows.find((r) => !r.completed_at)?.id ?? null;

  function toggle(id: string, next: boolean) {
    // Optimistic: a checkbox that waits on a round trip feels broken.
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, completed_at: next ? new Date().toISOString() : null } : r)),
    );
    startTransition(() => {
      fetch(`/api/board/meetings/${meetingId}/prep`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prepItemId: id, completed: next }),
      }).catch(() => {
        setRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, completed_at: next ? null : new Date().toISOString() } : r)),
        );
      });
    });
  }

  return (
    <section style={{ ...card }}>
      <div style={{ padding: "32px 32px 20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontFamily: F.heading, fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em", color: C.ink }}>
            Before the meeting
          </h2>
          <span style={{ fontSize: 15, color: C.muted, whiteSpace: "nowrap" }}>
            {done} of {rows.length} done
            {minutesLeft > 0 ? ` · about ${minutesLeft} min left` : ""}
          </span>
        </div>
        <div style={{ marginTop: 16, height: 3, borderRadius: 2, background: C.rule, overflow: "hidden" }}>
          <div
            style={{
              width: `${rows.length ? Math.round((done / rows.length) * 100) : 0}%`,
              height: "100%",
              background: C.ink,
              transition: "width .2s ease",
            }}
          />
        </div>
      </div>

      {rows.map((row) => {
        const isDone = !!row.completed_at;
        const isPrimary = row.id === firstOpen;
        return (
          <div
            key={row.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 16,
              padding: "20px 32px",
              borderTop: `1px solid ${C.rule}`,
            }}
          >
            <button
              type="button"
              onClick={() => toggle(row.id, !isDone)}
              aria-pressed={isDone}
              aria-label={isDone ? `Mark "${row.label}" not done` : `Mark "${row.label}" done`}
              style={{
                flex: "none",
                width: 26,
                height: 26,
                borderRadius: 6,
                marginTop: 2,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isDone ? C.ink : C.white,
                border: isDone ? "none" : `1.5px solid ${C.ruleStrong}`,
                padding: 0,
              }}
            >
              {isDone && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2.5 7.4L5.4 10.2L11.5 3.8" stroke={C.cream} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  color: isDone ? C.muted : C.ink,
                  textDecoration: isDone ? "line-through" : "none",
                }}
              >
                {row.label}
              </div>
              {row.sub_label && (
                <div style={{ fontSize: 15, color: C.muted, marginTop: 4 }}>{row.sub_label}</div>
              )}
            </div>

            {row.href && !isDone && (
              <Link
                href={row.href}
                style={{
                  flex: "none",
                  height: 40,
                  padding: isPrimary ? "0 18px" : "0 16px",
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  textDecoration: "none",
                  fontSize: 15,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  background: isPrimary ? C.ink : C.white,
                  color: isPrimary ? C.cream : C.ink,
                  border: isPrimary ? "none" : `1px solid ${C.ruleStrong}`,
                }}
              >
                Open
              </Link>
            )}
            {isDone && (
              <button
                type="button"
                onClick={() => toggle(row.id, false)}
                style={{
                  flex: "none",
                  fontSize: 15,
                  color: C.muted,
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                  padding: "9px 6px",
                  margin: "-3px -6px 0 0",
                  fontFamily: F.body,
                }}
              >
                Undo
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
