"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_TYPES, DOC_TYPE_LABEL } from "@/lib/documents/config";
import { C, F, card, eyebrow } from "./tokens";

type Row = { name: string; state: "queued" | "uploading" | "done" | "error"; message?: string };

/**
 * Put files into the portal from a browser. One component, two homes: the
 * meeting page files materials against a meeting, and the library files
 * corporate records against nothing.
 *
 * board_admin only in both cases, which is Remi and Shannon and nobody else —
 * the four directors hold board.read alone. The server re-checks; this
 * component being absent is a courtesy, not the gate.
 *
 * It exists rather than pointing Shannon at /admin/documents because that
 * upload modal has no way to attach a file to a meeting, so a document filed
 * there lands in the library and never reaches the meeting page.
 *
 * Uploads run one at a time rather than in parallel. Each file gets its own
 * row and its own error, so a single rejected file (wrong type, too large)
 * doesn't leave the others in an unknown state — which matters when the pack
 * is being filed an hour before a meeting.
 */
export default function FileUpload({
  endpoint,
  heading,
  blurb,
  defaultType,
  doneLabel = "Filed",
}: {
  endpoint: string;
  heading: string;
  blurb: string;
  defaultType: string;
  doneLabel?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [docType, setDocType] = useState(defaultType);
  const [busy, setBusy] = useState(false);
  // Two of these can share a page in principle; a fixed id would break the
  // label association for the second one.
  const selectId = useId();

  async function send(files: File[]) {
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, state: "queued" })));

    for (let i = 0; i < files.length; i++) {
      setRows((prev) => prev.map((r, j) => (j === i ? { ...r, state: "uploading" } : r)));
      const body = new FormData();
      body.set("file", files[i]);
      body.set("doc_type", docType);
      try {
        const res = await fetch(endpoint, { method: "POST", body });
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setRows((prev) =>
          prev.map((r, j) =>
            j === i
              ? res.ok
                ? { ...r, state: "done" }
                : { ...r, state: "error", message: payload.error ?? "Upload failed" }
              : r,
          ),
        );
      } catch {
        setRows((prev) =>
          prev.map((r, j) => (j === i ? { ...r, state: "error", message: "Network error" } : r)),
        );
      }
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <section className="board-noprint" style={{ ...card, padding: 28 }}>
      <div style={eyebrow}>Board admin</div>
      <h3 style={{ margin: "10px 0 0", fontFamily: F.heading, fontSize: 20, fontWeight: 600, color: C.ink }}>
        {heading}
      </h3>
      <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.55, color: C.muted }}>{blurb}</p>

      <label
        htmlFor={selectId}
        style={{ display: "block", fontFamily: F.heading, fontSize: 15, fontWeight: 500, color: C.ink, margin: "18px 0 8px" }}
      >
        Type
      </label>
      <select
        id={selectId}
        value={docType}
        onChange={(e) => setDocType(e.target.value)}
        disabled={busy}
        style={{
          width: "100%",
          height: 44,
          border: `1px solid ${C.ruleStrong}`,
          borderRadius: 6,
          background: C.white,
          padding: "0 12px",
          fontFamily: F.body,
          fontSize: 15,
          color: C.ink,
        }}
      >
        {DOC_TYPES.map((t) => (
          <option key={t} value={t}>
            {DOC_TYPE_LABEL[t] ?? t}
          </option>
        ))}
      </select>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.xlsx,.pptx,.csv,.txt,.png,.jpg,.jpeg"
        disabled={busy}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void send(files);
        }}
        style={{ display: "block", marginTop: 16, fontSize: 15, fontFamily: F.body, color: C.charcoal, width: "100%" }}
      />
      <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.5, color: C.muted }}>
        Choose several at once. Each is filed separately, so one bad file does not stop the rest.
      </p>

      {rows.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.rule}` }}>
          {rows.map((r) => (
            <div key={r.name} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "5px 0", fontSize: 15 }}>
              <span
                style={{
                  flex: "none",
                  width: 74,
                  color: r.state === "error" ? C.orangeDark : r.state === "done" ? C.charcoal : C.muted,
                  fontWeight: r.state === "error" ? 600 : 400,
                }}
              >
                {r.state === "done" ? doneLabel : r.state === "error" ? "Failed" : r.state === "uploading" ? "Sending" : "Queued"}
              </span>
              <span style={{ flex: 1, minWidth: 0, color: C.ink, wordBreak: "break-word" }}>
                {r.name}
                {r.message && <span style={{ color: C.orangeDark }}> — {r.message}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
