"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "../../../messages/_components/Avatar";

/**
 * Staff photo display + upload. Shows the signed-URL photo when set, else the
 * initials Avatar. When the viewer may edit (their own row, or staff.write),
 * an "Upload photo" control POSTs the file to /api/admin/staff/[id]/photo and
 * refreshes so the server re-mints a fresh signed URL. Mirrors the asks/report
 * upload idiom (hidden file input + FormData POST + router.refresh()).
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export default function PhotoControl({
  memberId,
  fullName,
  userId,
  photoUrl,
  canEdit,
}: {
  memberId: string;
  fullName: string;
  userId: string;
  photoUrl: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image is too large (max 5 MB).");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/staff/${memberId}/photo`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Upload failed. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-card border-[1.5px] border-outline bg-tile shadow-tile p-4 w-full flex justify-center">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={fullName}
            className="w-32 h-32 rounded-full object-cover"
          />
        ) : (
          <Avatar name={fullName} id={userId} size={128} />
        )}
      </div>

      {canEdit ? (
        <div className="flex flex-col items-center gap-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPick}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="text-xs font-semibold text-orange hover:text-orange-dark disabled:opacity-50"
          >
            {busy ? "Uploading…" : photoUrl ? "Replace photo" : "Upload photo"}
          </button>
          {error ? <p className="text-[11px] text-status-critical">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
