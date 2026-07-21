"use client";

// A record-anchored comment thread. Hangs off a CRM record (a constituent or
// a prospect), fetches its comments, and lets a teammate post, reply (one
// level), and soft-delete their own. Backed by entity_comments via
// /api/admin/comments, so RLS scopes everything to the org. @mentions land in
// Phase 5; v1 is plain text.

import { useCallback, useEffect, useState } from "react";
import { MentionTextarea, type Mentionable } from "./MentionTextarea";
import { TYPE } from "@/lib/admin/typeScale";

export type CommentEntityType =
  | "constituent"
  | "fr_prospects"
  | "board_member"
  | "compliance_item"
  | "student";

type Comment = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  parentId: string | null;
  createdAt: string;
};

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const initial = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

// Render a comment body, bolding @mentions that match a known teammate.
function MentionBody({ text, names }: { text: string; names: Set<string> }) {
  const parts = text.split(/(@\w+)/g);
  return (
    <p className="text-sm text-ink-1 mt-0.5 whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        p.startsWith("@") && names.has(p.slice(1).toLowerCase()) ? (
          <span key={i} className="font-semibold text-orange-dark">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </p>
  );
}

export function CommentThread({
  entityType,
  entityId,
  entityLabel,
}: {
  entityType: CommentEntityType;
  entityId: string;
  entityLabel: string;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [members, setMembers] = useState<Mentionable[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ entity_type: entityType, entity_id: entityId });
    const res = await fetch(`/api/admin/comments?${params}`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    setComments(Array.isArray(j.comments) ? j.comments : []);
    setMe(typeof j.me === "string" ? j.me : null);
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => { void load(); }, [load]);

  // @mention autocomplete source (org members), fetched once.
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/members", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((j) => { if (alive) setMembers(Array.isArray(j.members) ? j.members : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Lowercased member names, for bolding @mentions in rendered bodies.
  const mentionNames = new Set(members.map((m) => m.displayName.toLowerCase()));

  const post = async (text: string, parentId: string | null) => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          entity_label: entityLabel,
          body: text.trim(),
          parent_id: parentId,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { alert(j.error ?? `HTTP ${res.status}`); return; }
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/comments/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  // Group into one level: replies render under their parent; a reply whose
  // parent is gone (e.g. soft-deleted) is promoted to top level so nothing
  // silently disappears.
  const visible = new Set(comments.map((c) => c.id));
  const topLevel = comments.filter((c) => !c.parentId || !visible.has(c.parentId));
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  const Row = ({ c, isReply }: { c: Comment; isReply: boolean }) => (
    <div className={isReply ? "pl-4 border-l-2 border-hairline" : ""}>
      <div className="flex items-start gap-2.5 py-2.5">
        <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-light text-orange-dark text-[11px] font-bold">
          {initial(c.authorName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-ink-1">{c.authorName}</span>
            <span className="text-[11px] text-ink-3">{timeAgo(c.createdAt)}</span>
          </div>
          <MentionBody text={c.body} names={mentionNames} />
          <div className="flex items-center gap-3 mt-1">
            {!isReply && (
              <button
                onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyBody(""); }}
                className="text-[11px] font-semibold text-ink-3 hover:text-orange transition-colors"
              >
                {replyTo === c.id ? "Cancel" : "Reply"}
              </button>
            )}
            {me === c.authorId && (
              <button
                onClick={() => del(c.id)}
                disabled={busy}
                className="text-[11px] font-semibold text-ink-3 hover:text-expense transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>

          {replyTo === c.id && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await post(replyBody, c.id);
                if (ok) { setReplyTo(null); setReplyBody(""); }
              }}
              className="mt-2 flex flex-col gap-2"
            >
              <MentionTextarea
                value={replyBody}
                onChange={setReplyBody}
                members={members}
                placeholder={`Reply to ${c.authorName}…  (@ to mention)`}
                rows={2}
                autoFocus
                className={`w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 ${TYPE.body} placeholder-ink-3 focus:outline-none focus:border-orange/40 resize-y`}
              />
              <div>
                <button
                  type="submit"
                  disabled={busy || !replyBody.trim()}
                  className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full disabled:opacity-50"
                >
                  {busy ? "Posting…" : "Reply"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      {repliesOf(c.id).map((r) => <Row key={r.id} c={r} isReply />)}
    </div>
  );

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-outline">
        <h2 className={TYPE.cardTitle}>
          Comments {comments.length > 0 && <span className="text-ink-3 font-normal">· {comments.length}</span>}
        </h2>
      </div>

      <div className="px-5 py-4 border-b border-outline bg-surface">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await post(body, null);
            if (ok) setBody("");
          }}
          className="flex flex-col gap-2"
        >
          <MentionTextarea
            value={body}
            onChange={setBody}
            members={members}
            placeholder={`Leave a note about ${entityLabel} for the team…  (@ to mention)`}
            rows={2}
            className={`w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 ${TYPE.body} placeholder-ink-3 focus:outline-none focus:border-orange/40 resize-y`}
          />
          <div>
            <button
              type="submit"
              disabled={busy || !body.trim()}
              className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full disabled:opacity-50"
            >
              {busy ? "Posting…" : "Post comment"}
            </button>
          </div>
        </form>
      </div>

      {loading ? (
        <p className="px-5 py-5 text-ink-3 text-sm">Loading comments…</p>
      ) : topLevel.length === 0 ? (
        <p className={`px-5 py-5 ${TYPE.bodyMuted}`}>No comments yet. Start the thread above.</p>
      ) : (
        <div className="px-5 py-2 divide-y divide-hairline">
          {topLevel.map((c) => <Row key={c.id} c={c} isReply={false} />)}
        </div>
      )}
    </section>
  );
}
