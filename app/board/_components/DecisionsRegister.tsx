"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { C, F, card } from "./tokens";

type Row = {
  id: string;
  motion: string;
  fiscal: string;
  date: string;
  year: string;
  tally: string;
  abstain: string;
  meetingId: string;
};

/**
 * Every motion the board has ever passed (spec §5.6).
 *
 * This is what a minute book is for, and today it exists only as files in a
 * zip. It is the first thing a new director, an auditor, or a funder doing
 * diligence will want.
 *
 * Search is token-based, not substring: the prototype matched indexOf() on the
 * whole query, so "bylaws 2026" or "insurance certificate" returned nothing.
 * Every whitespace-separated token must appear somewhere in the row.
 */
export default function DecisionsRegister({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("All");

  const years = useMemo(
    () => ["All", ...Array.from(new Set(rows.map((r) => r.year).filter(Boolean))).sort().reverse()],
    [rows],
  );

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (year !== "All" && r.year !== year) return false;
      if (!tokens.length) return true;
      const hay = `${r.motion} ${r.fiscal} ${r.date} ${r.tally} ${r.abstain}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [rows, query, year]);

  return (
    <>
      <div style={{ marginTop: 32 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every motion the board has passed"
          aria-label="Search motions"
          style={{
            width: "100%",
            maxWidth: 560,
            height: 52,
            border: `1px solid ${C.ruleStrong}`,
            borderRadius: 6,
            background: C.white,
            padding: "0 18px",
            fontFamily: F.body,
            fontSize: 17,
            color: C.ink,
            outline: "none",
          }}
        />
      </div>

      <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, color: C.muted }}>Year</span>
        {years.map((y) => {
          const on = year === y;
          return (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              aria-pressed={on}
              style={{
                fontFamily: F.heading,
                fontSize: 15,
                fontWeight: 500,
                color: on ? C.cream : C.charcoal,
                background: on ? C.ink : C.white,
                border: `1px solid ${on ? C.ink : C.rule}`,
                borderRadius: 999,
                // 8px, not the prototype's 7px: this clears a 32px target.
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              {y}
            </button>
          );
        })}
      </div>

      <div style={{ ...card, marginTop: 24 }}>
        <div style={{ display: "flex", gap: 24, padding: "18px 28px", borderBottom: `1px solid ${C.rule}` }}>
          <span style={head(1)}>Motion</span>
          <span style={{ ...head(0), width: 170 }}>Meeting</span>
          <span style={{ ...head(0), width: 190 }}>Vote</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 28, fontSize: 17, lineHeight: 1.6, color: C.muted }}>
            No motion matches that. The register holds every motion on record.
          </div>
        ) : (
          filtered.map((r) => (
            <Link
              key={r.id}
              href={`/board/meetings/${r.meetingId}`}
              className="board-row"
              style={{
                display: "flex",
                gap: 24,
                padding: "20px 28px",
                borderBottom: `1px solid ${C.rule}`,
                textDecoration: "none",
                color: C.ink,
                flexWrap: "wrap",
              }}
            >
              <p style={{ margin: 0, flex: "1 1 260px", minWidth: 0, fontSize: 17, lineHeight: 1.5, maxWidth: "60ch" }}>
                {r.motion}
              </p>
              <span style={{ flex: "none", width: 170 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 500 }}>{r.fiscal}</span>
                <span style={{ display: "block", fontSize: 15, color: C.muted }}>{r.date}</span>
              </span>
              <span style={{ flex: "none", width: 190 }}>
                <span style={{ display: "block", fontSize: 15 }}>{r.tally}</span>
                <span style={{ display: "block", fontSize: 15, color: C.muted }}>{r.abstain}</span>
              </span>
            </Link>
          ))
        )}
      </div>
    </>
  );
}

function head(flex: number): React.CSSProperties {
  return {
    flex: flex ? 1 : "none",
    fontFamily: F.heading,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: C.muted,
  };
}
