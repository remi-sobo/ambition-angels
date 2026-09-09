"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { C, F } from "./tokens";

/**
 * Move a document off a meeting, or delete it outright (board.write only).
 *
 * "Move to library" is the primary action and deliberately so: a library
 * document is one with no meeting link, so moving is a single row removed and
 * is fully reversible by filing it again. Nothing is re-uploaded and nothing
 * is lost. Delete exists for a genuine mis-upload, is styled quieter, and
 * asks first, because it takes the stored file with it.
 */
export default function MaterialActions({
  meetingId,
  documentId,
  title,
}: {
  meetingId: string;
  documentId: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "unlink" | "delete">("");
  const [error, setError] = useState<string | null>(null);

  async function run(mode: "unlink" | "delete") {
    if (mode === "delete" && !window.confirm(`Delete "${title}" permanently? This cannot be undone.`)) return;
    setBusy(mode);
    setError(null);
    try {
      const res = await fetch(`/api/board/meetings/${meetingId}/materials/${documentId}?mode=${mode}`, {
        method: "DELETE",
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(payload.error ?? "That did not work.");
      else router.refresh();
    } catch {
      setError("Network error.");
    }
    setBusy("");
  }

  const link: React.CSSProperties = {
    appearance: "none",
    background: "none",
    border: "none",
    padding: 0,
    fontFamily: F.body,
    fontSize: 15,
    cursor: busy ? "default" : "pointer",
    textDecorationLine: "underline",
    textUnderlineOffset: 3,
  };

  return (
    <span style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
      <button type="button" onClick={() => void run("unlink")} disabled={!!busy} style={{ ...link, color: C.charcoal }}>
        {busy === "unlink" ? "Moving" : "Move to library"}
      </button>
      <button type="button" onClick={() => void run("delete")} disabled={!!busy} style={{ ...link, color: C.muted }}>
        {busy === "delete" ? "Deleting" : "Delete"}
      </button>
      {error && <span style={{ fontSize: 15, color: C.orangeDark }}>{error}</span>}
    </span>
  );
}
