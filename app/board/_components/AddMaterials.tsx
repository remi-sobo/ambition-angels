"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_TYPES, DOC_TYPE_LABEL } from "@/lib/documents/config";
import { C, F, card, eyebrow } from "./tokens";

type Row = { name: string; state: "queued" | "uploading" | "done" | "error"; message?: string };

/**
 * File materials against this meeting, from a browser.
 *
 * board_admin only. This is the surface Shannon uses before every meeting, and
 * it is deliberately here rather than in /admin/documents: the documents
 * upload modal has no way to attach a file to a meeting, so a document filed
 * there would land in the library and never appear on this page.
 *
 * Uploads run one at a time rather than in parallel. Each file gets its own
 * row and its own error, so a single rejected file (wrong type, too large)
 * doesn't leave the others in an unknown state — which matters when the pack
 * is being filed an hour before a meeting.
 */
export default function AddMaterials({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [docType, setDocType] = useState("board_packet");
  const [busy, setBusy] = useState(false);

  async function send(files: File[]) {
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, state: "queued" })));

    for (let i = 0; i < files.length; i++) {
      setRows((prev) => prev.map((r, j) => (j === i ? { ...r, state: "uploading" } : r)));
      const body = new FormData();
      body.set("file", files[i]);
      body.set("doc_type", docType);
      try {
        const res = await fetch(`/api/board/meetings/${meetingId}/materials`, { method: "POST", body });
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
        File materials
      </h3>
      <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.55, color: C.muted }}>
        Attaches to this meeting and appears under Materials for every director. Directors cannot see this.
      </p>

      <label
        htmlFor="material-type"
        style={{ display: "block", fontFamily: F.heading, fontSize: 15, fontWeight: 500, color: C.ink, margin: "18px 0 8px" }}
      >
        Type
      </label>
      <select
        id="material-type"
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
                {r.state === "done" ? "Filed" : r.state === "error" ? "Failed" : r.state === "uploading" ? "Sending" : "Queued"}
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
