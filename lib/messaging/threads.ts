import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getDisplayNames, getMyDisplayName, nameFromEmail } from "@/lib/admin/profile";
import { getOrgMentionables } from "@/lib/comments/mentions";
import { notify } from "@/lib/notifications/notify";
import type { OrgContext } from "@/lib/admin/auth";

/**
 * The single data path for BloomOS Messages (DM + group). Like notify(), every
 * read and write here runs through the service-role client AFTER the caller has
 * resolved an OrgContext, and is always scoped by ctx.orgId and ctx.userId —
 * client-supplied ids are validated, never trusted. RLS (create_messaging.sql)
 * is the defense-in-depth backstop.
 *
 * See docs/bloomos/messaging-spec.md.
 */

const MAX_BODY = 4000;
const FALLBACK_NAME = "Teammate";

export type ThreadParticipant = { userId: string; name: string };

export type ThreadSummary = {
  id: string;
  isGroup: boolean;
  title: string | null;
  /** Display label: group title, or the other member(s)' names for a DM. */
  label: string;
  /** Everyone in the thread, including me. */
  participants: ThreadParticipant[];
  /** Everyone except me — what the avatars/label are built from. */
  others: ThreadParticipant[];
  lastMessage: {
    body: string;
    senderId: string;
    senderName: string;
    createdAt: string;
  } | null;
  lastMessageAt: string;
  unread: number;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  /** True when the signed-in user sent it (drives bubble alignment). */
  mine: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

function nowIso(): string {
  return new Date().toISOString();
}

/** Does this user belong to this thread? (membership gate for reads/writes) */
async function isMember(threadId: string, userId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("message_thread_members")
    .select("thread_id")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/** Org members the current user can start a conversation with (excludes self). */
export async function listOrgPeople(ctx: OrgContext): Promise<ThreadParticipant[]> {
  const people = await getOrgMentionables(ctx.orgId);
  return people
    .filter((p) => p.userId !== ctx.userId)
    .map((p) => ({ userId: p.userId, name: p.displayName }));
}

/** Build the DM dedupe key for an unordered pair: "min:max". */
function dmKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

/** All of my threads, newest-first, with participants, preview, and unread. */
export async function listThreads(ctx: OrgContext): Promise<ThreadSummary[]> {
  const admin = getSupabaseAdmin();

  const { data: mine } = await admin
    .from("message_thread_members")
    .select("thread_id, last_read_at")
    .eq("user_id", ctx.userId)
    .eq("org_id", ctx.orgId);

  const myRows = (mine ?? []) as { thread_id: string; last_read_at: string | null }[];
  const threadIds = myRows.map((r) => r.thread_id);
  if (threadIds.length === 0) return [];
  const lastReadByThread = new Map(myRows.map((r) => [r.thread_id, r.last_read_at]));

  const [threadsRes, membersRes, msgsRes] = await Promise.all([
    admin
      .from("message_threads")
      .select("id, is_group, title, last_message_at, created_at")
      .in("id", threadIds),
    admin
      .from("message_thread_members")
      .select("thread_id, user_id")
      .in("thread_id", threadIds),
    admin
      .from("messages")
      .select("id, thread_id, sender_id, body, created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const threads = (threadsRes.data ?? []) as {
    id: string;
    is_group: boolean;
    title: string | null;
    last_message_at: string;
    created_at: string;
  }[];
  const memberRows = (membersRes.data ?? []) as { thread_id: string; user_id: string }[];
  const msgs = (msgsRes.data ?? []) as {
    id: string;
    thread_id: string;
    sender_id: string;
    body: string;
    created_at: string;
  }[];

  const names = await getDisplayNames(Array.from(new Set(memberRows.map((m) => m.user_id))));
  const nameOf = (id: string) => names[id] ?? FALLBACK_NAME;

  // Group members and messages by thread for O(1) assembly.
  const membersByThread = new Map<string, ThreadParticipant[]>();
  for (const m of memberRows) {
    const arr = membersByThread.get(m.thread_id) ?? [];
    arr.push({ userId: m.user_id, name: nameOf(m.user_id) });
    membersByThread.set(m.thread_id, arr);
  }

  // msgs is newest-first, so the first hit per thread is its latest message.
  const lastByThread = new Map<string, (typeof msgs)[number]>();
  const unreadByThread = new Map<string, number>();
  for (const m of msgs) {
    if (!lastByThread.has(m.thread_id)) lastByThread.set(m.thread_id, m);
    const lastRead = lastReadByThread.get(m.thread_id) ?? null;
    const isUnread = m.sender_id !== ctx.userId && (!lastRead || m.created_at > lastRead);
    if (isUnread) unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) ?? 0) + 1);
  }

  const summaries: ThreadSummary[] = threads.map((t) => {
    const participants = membersByThread.get(t.id) ?? [];
    const others = participants.filter((p) => p.userId !== ctx.userId);
    const last = lastByThread.get(t.id) ?? null;
    const label =
      (t.title && t.title.trim()) ||
      (others.length ? others.map((o) => o.name).join(", ") : "You");
    return {
      id: t.id,
      isGroup: t.is_group,
      title: t.title,
      label,
      participants,
      others,
      lastMessage: last
        ? {
            body: last.body,
            senderId: last.sender_id,
            senderName: nameOf(last.sender_id),
            createdAt: last.created_at,
          }
        : null,
      lastMessageAt: t.last_message_at,
      unread: unreadByThread.get(t.id) ?? 0,
    };
  });

  summaries.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
  return summaries;
}

/**
 * Messages in a thread, oldest-first. Returns null when the caller isn't a
 * member (so the route can 404). `afterIso` drives the open-conversation poll.
 */
export async function getMessages(
  ctx: OrgContext,
  threadId: string,
  afterIso?: string | null
): Promise<ChatMessage[] | null> {
  if (!isUuid(threadId)) return null;
  if (!(await isMember(threadId, ctx.userId))) return null;

  const admin = getSupabaseAdmin();
  let q = admin
    .from("messages")
    .select("id, thread_id, sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (afterIso) q = q.gt("created_at", afterIso);

  const { data } = await q;
  const rows = (data ?? []) as {
    id: string;
    thread_id: string;
    sender_id: string;
    body: string;
    created_at: string;
  }[];

  const names = await getDisplayNames(Array.from(new Set(rows.map((r) => r.sender_id))));
  return rows.map((r) => ({
    id: r.id,
    threadId: r.thread_id,
    senderId: r.sender_id,
    senderName: names[r.sender_id] ?? FALLBACK_NAME,
    body: r.body,
    createdAt: r.created_at,
    mine: r.sender_id === ctx.userId,
  }));
}

/**
 * Find-or-create a conversation. One recipient → a deduped DM (canonical per
 * pair via dm_key). Multiple recipients → a fresh group (never deduped).
 * Returns the thread id, or null if no valid org recipients remain.
 */
export async function ensureThread(
  ctx: OrgContext,
  recipientIds: string[],
  title?: string | null
): Promise<string | null> {
  const admin = getSupabaseAdmin();

  const requested = Array.from(
    new Set(recipientIds.filter((id) => isUuid(id) && id !== ctx.userId))
  );
  if (requested.length === 0) return null;

  // Keep only real co-members of this org — closes the "DM a stranger" hole.
  const { data: validRows } = await admin
    .from("memberships")
    .select("user_id")
    .eq("org_id", ctx.orgId)
    .in("user_id", requested);
  const recipients = ((validRows ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (recipients.length === 0) return null;

  const memberIds = Array.from(new Set([ctx.userId, ...recipients]));
  const isGroup = memberIds.length > 2;

  if (!isGroup) {
    const key = dmKey(ctx.userId, recipients[0]);
    const { data: existing } = await admin
      .from("message_threads")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("dm_key", key)
      .maybeSingle();
    if (existing) return (existing as { id: string }).id;

    const { data: created, error } = await admin
      .from("message_threads")
      .insert({
        org_id: ctx.orgId,
        is_group: false,
        dm_key: key,
        created_by: ctx.userId,
        last_message_at: nowIso(),
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("[messaging] create DM failed:", error?.message);
      return null;
    }
    const threadId = (created as { id: string }).id;
    await insertMembers(threadId, ctx.orgId, memberIds);
    return threadId;
  }

  const cleanTitle = typeof title === "string" ? title.trim() : "";
  const { data: created, error } = await admin
    .from("message_threads")
    .insert({
      org_id: ctx.orgId,
      is_group: true,
      title: cleanTitle || null,
      created_by: ctx.userId,
      last_message_at: nowIso(),
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[messaging] create group failed:", error?.message);
    return null;
  }
  const threadId = (created as { id: string }).id;
  await insertMembers(threadId, ctx.orgId, memberIds);
  return threadId;
}

async function insertMembers(threadId: string, orgId: string, userIds: string[]): Promise<void> {
  const admin = getSupabaseAdmin();
  const rows = userIds.map((uid) => ({ thread_id: threadId, user_id: uid, org_id: orgId }));
  const { error } = await admin.from("message_thread_members").upsert(rows, {
    onConflict: "thread_id,user_id",
    ignoreDuplicates: true,
  });
  if (error) console.error("[messaging] insert members failed:", error.message);
}

/**
 * Send a message: insert it, bump the thread, mark the sender caught-up, and
 * drop an Inbox pointer for each other participant (one standing unread
 * pointer per thread). Returns the created message, or null on failure / when
 * the caller isn't a member.
 */
export async function postMessage(
  ctx: OrgContext,
  threadId: string,
  body: string
): Promise<ChatMessage | null> {
  if (!isUuid(threadId)) return null;
  const text = body.trim();
  if (!text || text.length > MAX_BODY) return null;
  if (!(await isMember(threadId, ctx.userId))) return null;

  const admin = getSupabaseAdmin();
  const { data: created, error } = await admin
    .from("messages")
    .insert({ thread_id: threadId, org_id: ctx.orgId, sender_id: ctx.userId, body: text })
    .select("id, created_at")
    .single();
  if (error || !created) {
    console.error("[messaging] send failed:", error?.message);
    return null;
  }
  const row = created as { id: string; created_at: string };

  // Bump ordering and mark the sender read (you've seen your own message).
  await admin
    .from("message_threads")
    .update({ last_message_at: row.created_at })
    .eq("id", threadId);
  await admin
    .from("message_thread_members")
    .update({ last_read_at: row.created_at })
    .eq("thread_id", threadId)
    .eq("user_id", ctx.userId);

  const senderName = (await getMyDisplayName()) ?? nameFromEmail(ctx.email);
  await fanOutInbox(ctx, threadId, text, senderName).catch((e) =>
    console.error("[messaging] inbox fan-out threw:", e)
  );

  return {
    id: row.id,
    threadId,
    senderId: ctx.userId,
    senderName,
    body: text,
    createdAt: row.created_at,
    mine: true,
  };
}

/** One standing "you have messages" Inbox pointer per thread, per recipient. */
async function fanOutInbox(
  ctx: OrgContext,
  threadId: string,
  body: string,
  senderName: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: roster } = await admin
    .from("message_thread_members")
    .select("user_id")
    .eq("thread_id", threadId)
    .neq("user_id", ctx.userId);
  const others = ((roster ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (others.length === 0) return;

  const preview = body.length > 140 ? `${body.slice(0, 139)}…` : body;
  const url = `/admin/messages?t=${threadId}`;

  for (const uid of others) {
    const { data: pending } = await admin
      .from("notifications")
      .select("id")
      .eq("recipient_id", uid)
      .eq("linked_entity_type", "message_thread")
      .eq("linked_entity_id", threadId)
      .is("read_at", null)
      .limit(1)
      .maybeSingle();
    if (pending) continue; // already has an unread pointer for this thread

    await notify({
      orgId: ctx.orgId,
      recipientId: uid,
      actorId: ctx.userId,
      type: "message.received",
      title: `New message from ${senderName}`,
      body: preview,
      linkedEntityType: "message_thread",
      linkedEntityId: threadId,
      url,
    });
  }
}

/** Total unread messages across all my threads (sidebar badge). */
export async function unreadCount(ctx: OrgContext): Promise<number> {
  const admin = getSupabaseAdmin();
  const { data: mine } = await admin
    .from("message_thread_members")
    .select("thread_id, last_read_at")
    .eq("user_id", ctx.userId)
    .eq("org_id", ctx.orgId);
  const myRows = (mine ?? []) as { thread_id: string; last_read_at: string | null }[];
  if (myRows.length === 0) return 0;
  const lastReadByThread = new Map(myRows.map((r) => [r.thread_id, r.last_read_at]));

  const { data } = await admin
    .from("messages")
    .select("thread_id, sender_id, created_at")
    .in("thread_id", Array.from(lastReadByThread.keys()))
    .neq("sender_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(2000);

  let count = 0;
  for (const m of (data ?? []) as { thread_id: string; sender_id: string; created_at: string }[]) {
    const lastRead = lastReadByThread.get(m.thread_id) ?? null;
    if (!lastRead || m.created_at > lastRead) count += 1;
  }
  return count;
}

/** Mark a thread read: catch up last_read_at and clear its Inbox pointers. */
export async function markRead(ctx: OrgContext, threadId: string): Promise<boolean> {
  if (!isUuid(threadId)) return false;
  if (!(await isMember(threadId, ctx.userId))) return false;

  const admin = getSupabaseAdmin();
  const ts = nowIso();
  await admin
    .from("message_thread_members")
    .update({ last_read_at: ts })
    .eq("thread_id", threadId)
    .eq("user_id", ctx.userId);
  await admin
    .from("notifications")
    .update({ read_at: ts })
    .eq("recipient_id", ctx.userId)
    .eq("linked_entity_type", "message_thread")
    .eq("linked_entity_id", threadId)
    .is("read_at", null);
  return true;
}
