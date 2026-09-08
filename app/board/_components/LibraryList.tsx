"use client";

import { useMemo, useState } from "react";
import { fileSize, plainDate } from "@/lib/board/format";
import { C, F, card, eyebrow } from "./tokens";

export type LibraryDoc = {
  id: string;
  title: string | null;
  filename: string;
  mime: string | null;
  size_bytes: number | null;
  doc_type: string | null;
  expires_at: string | null;
  created_at: string;
};

/**
 * Grouping is by doc_type, which is what /admin/documents already sets.
 * A document with no type still appears — under "Other" — because a file that
 * silently vanishes from the library because someone forgot a dropdown is a
 * worse failure than an untidy heading.
 */
const GROUPS: { section: string; blurb: string; groups: { name: string; types: string[]; note?: string }[] }[] = [
  {
    section: "Corporate records",
    blurb:
      "The current version of every governing document, in force today. History lives in the corporate minutes book, which Shannon keeps and every director can reach.",
    groups: [
      { name: "Corporate", types: ["bylaws", "articles", "determination_letter", "resolution", "written_consent"] },
      { name: "Insurance", types: ["insurance", "coi_certificate"], note: "Replaced each year at renewal, so what is here is always the coverage in force today." },
      { name: "State registrations", types: ["registration", "rrf1", "statement_of_information"] },
      { name: "Policies", types: ["policy"] },
      { name: "Filings", types: ["990", "199", "filing"] },
    ],
  },
  {
    section: "Board resources",
    blurb: "What you may want when you are introducing Ambition to a funder, a school, a partner or a supporter.",
    groups: [
      { name: "For a funder", types: ["case_for_support", "one_pager", "impact"] },
      { name: "For a school or program", types: ["price_sheet", "overview"] },
      { name: "Brand and bio", types: ["brand", "bio"] },
    ],
  },
];

export default function LibraryList({ docs }: { docs: LibraryDoc[] }) {
  const [query, setQuery] = useState("");

  // Token-based search: every whitespace-separated token must appear. The
  // prototype matched the raw query as one substring, so "D&O policy" or
  // "insurance certificate" returned nothing.
  const matches = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return docs;
    return docs.filter((d) => {
      const hay = `${d.title ?? ""} ${d.filename} ${d.doc_type ?? ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [docs, query]);

  const claimed = new Set<string>();
  const sections = GROUPS.map((s) => ({
    ...s,
    groups: s.groups
      .map((g) => {
        const rows = matches.filter((d) => {
          if (claimed.has(d.id)) return false;
          return g.types.includes(d.doc_type ?? "");
        });
        rows.forEach((r) => claimed.add(r.id));
        return { ...g, rows };
      })
      .filter((g) => g.rows.length > 0),
  })).filter((s) => s.groups.length > 0);

  const other = matches.filter((d) => !claimed.has(d.id));

  if (matches.length === 0) {
    return (
      <>
        <SearchBox value={query} onChange={setQuery} />
        <p style={{ margin: "40px 0 0", fontSize: 17, lineHeight: 1.6, color: C.muted }}>
          {docs.length === 0
            ? "Nothing has been filed to the library yet. Shannon uploads the corporate records in /admin."
            : "Nothing matches that. Ask Shannon if you expected to find something here."}
        </p>
      </>
    );
  }

  return (
    <>
      <SearchBox value={query} onChange={setQuery} />
      {sections.map((s) => (
        <section key={s.section} style={{ marginTop: 48 }}>
          <h2 style={{ margin: 0, fontFamily: F.heading, fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em", color: C.ink }}>
            {s.section}
          </h2>
          <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.6, color: C.muted, maxWidth: "68ch" }}>{s.blurb}</p>
          {s.groups.map((g) => (
            <Group key={g.name} name={g.name} note={g.note} rows={g.rows} />
          ))}
        </section>
      ))}
      {other.length > 0 && (
        <section style={{ marginTop: 48 }}>
          <h2 style={{ margin: 0, fontFamily: F.heading, fontSize: 24, fontWeight: 600, color: C.ink }}>Other</h2>
          <Group name="Filed to the board" rows={other} />
        </section>
      )}
    </>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginTop: 28 }}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Find a board document"
        aria-label="Find a board document"
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
  );
}

function Group({ name, note, rows }: { name: string; note?: string; rows: LibraryDoc[] }) {
  return (
    <div style={{ marginTop: 32 }}>
      <div style={eyebrow}>{name}</div>
      {/* The group note survives search: the prototype rebuilt each group
          during filtering and dropped it, so the explanatory lines vanished
          the moment a director typed. */}
      {note && (
        <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.55, color: C.muted, maxWidth: "68ch" }}>{note}</p>
      )}
      <div style={{ ...card, marginTop: 12 }}>
        {rows.map((d, i) => (
          <a
            key={d.id}
            className="board-row"
            href={`/api/board/documents/${d.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "18px 28px",
              borderTop: i === 0 ? "none" : `1px solid ${C.rule}`,
              textDecoration: "none",
              color: C.ink,
              flexWrap: "wrap",
            }}
          >
            <span style={{ flex: "1 1 220px", minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 17, fontWeight: 500, lineHeight: 1.4 }}>
                {d.title || d.filename}
              </span>
              <span style={{ display: "block", fontSize: 15, color: C.muted, marginTop: 3 }}>
                {[d.mime?.includes("pdf") ? "PDF" : null, `Filed ${plainDate(d.created_at)}`].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span style={{ flex: "none", fontSize: 15, color: C.muted, width: 80, textAlign: "right" }}>
              {fileSize(d.size_bytes)}
            </span>
            <span className="board-open" style={{ flex: "none", fontSize: 15, fontWeight: 500, borderBottom: `1px solid ${C.ruleStrong}` }}>
              Open
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
