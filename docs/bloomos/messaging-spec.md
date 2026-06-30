# BloomOS Messages — design spec

Internal team messaging inside BloomOS: one-to-one (DM) and multi-person
(group) conversations between org members, living in the Command Center next to
the Inbox. **Not Slack** — no channels, no presence, no threads-within-threads,
no files in v1. A focused, beautiful place for the team (today Remi & Shannon,
extensible to any membership) to message each other, with each new message also
surfacing in the existing notification **Inbox** so nothing gets missed.

This mirrors the proven notifications spine (`notifications_spine.sql`,
`/admin/inbox`): server-rendered, polling-based refresh (Realtime deferred),
RLS-backed, single server-side write path.

---

## 1. Data model

Three additive tables in `public`, all org-scoped, all RLS-guarded.

### `message_threads`
A conversation — a DM (two people) or a named/unnamed group.

| column            | type          | notes                                                        |
| ----------------- | ------------- | ------------------------------------------------------------ |
| `id`              | uuid pk       | `gen_random_uuid()`                                          |
| `org_id`          | uuid fk orgs  | tenant scope, never a column default — set from session      |
| `is_group`        | bool          | false = DM (exactly two members), true = group               |
| `title`           | text null     | optional group name; DMs render the other member's name      |
| `dm_key`          | text null     | `min(uid):max(uid)` for DMs, null for groups — dedupe key    |
| `created_by`      | uuid fk users | opener                                                       |
| `last_message_at` | timestamptz   | denormalized for cheap newest-first ordering of the list     |
| `created_at`      | timestamptz   | default `now()`                                              |

`unique (org_id, dm_key)` (partial, where `dm_key is not null`) guarantees one
canonical DM thread per pair — opening a DM with someone always resolves to the
same conversation. Groups are never deduped.

### `message_thread_members`
Who is in a conversation, and how far each person has read.

| column         | type          | notes                                                |
| -------------- | ------------- | ---------------------------------------------------- |
| `thread_id`    | uuid fk       | `on delete cascade`                                  |
| `user_id`      | uuid fk users | participant                                          |
| `org_id`       | uuid fk orgs  | denormalized for RLS/permission checks               |
| `last_read_at` | timestamptz   | unread = messages after this not sent by me          |
| `added_at`     | timestamptz   | default `now()`                                      |
| pk             |               | `(thread_id, user_id)`                               |

### `messages`
| column       | type          | notes                              |
| ------------ | ------------- | ---------------------------------- |
| `id`         | uuid pk       |                                    |
| `thread_id`  | uuid fk       | `on delete cascade`                |
| `org_id`     | uuid fk orgs  |                                    |
| `sender_id`  | uuid fk users |                                    |
| `body`       | text          | 1–4000 chars, trimmed, not empty   |
| `created_at` | timestamptz   | default `now()`, feed ordering     |

**Unread** for a thread = `count(messages where created_at > my last_read_at and sender_id <> me)`.
Total badge = sum across my threads.

---

## 2. RLS

Same shape as the notifications spine: `private.has_permission(org_id, 'messages.read' | 'messages.write')`
plus thread membership. Thread membership is checked through a `SECURITY DEFINER`
helper so the `message_thread_members` self-reference doesn't recurse (the
documented Postgres-RLS gotcha — same trick `private.is_org_member` uses):

```sql
create function private.is_thread_member(p_thread uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = ''
as $$ select exists (
  select 1 from public.message_thread_members
  where thread_id = p_thread and user_id = p_user
); $$;
```

- **threads** — read if member + `messages.read`; insert if `created_by = auth.uid()` + `messages.write`.
- **thread_members** — read rows of any thread you belong to (via the helper).
- **messages** — read if member + `messages.read`; insert if `sender_id = auth.uid()` + member + `messages.write`.

Permission keys registered in `role_permissions` for owner/admin/staff/finance
(not `board_viewer` — board guests don't get the team messenger).

All actual writes go through the service role in `lib/messaging/threads.ts`
after an explicit `getOrgContext()` + membership check; RLS is the
defense-in-depth backstop, exactly as `notify()` relates to the notifications
policies.

---

## 3. Server lib — `lib/messaging/threads.ts`

The single data path (service role + explicit org/membership scoping — never
trusts client-supplied ids):

- `listThreads(ctx)` → `ThreadSummary[]` (participants, last-message preview, per-thread unread), newest-first.
- `getMessages(ctx, threadId, afterIso?)` → `ChatMessage[]` (membership-checked; `after` drives polling).
- `ensureThread(ctx, recipientIds, title?)` → `{ threadId }` — dedupes DMs via `dm_key`, always creates groups.
- `postMessage(ctx, threadId, body)` — inserts, bumps `last_message_at`, marks sender read, fans out Inbox notifications.
- `unreadCount(ctx)` → number (badge).
- `markRead(ctx, threadId)` — sets `last_read_at = now()` and clears the thread's message notifications.

### Inbox integration ("messages in the inbox as well")
On `postMessage`, each *other* participant gets a `notify()` of type
`message.received`, `url = /admin/messages?t=<threadId>`, so the message appears
in the existing **Inbox** feed and drives the existing inbox badge. To avoid
spamming the Inbox during a live back-and-forth, we only create a notification
if that recipient has **no unread** `message.received` notification for the
thread already (one standing pointer per thread until they read it). Opening the
thread (`markRead`) clears both the messaging unread and those Inbox pointers.
`message.received` is **not** in `EMAIL_TYPES`, so it's in-app only.

---

## 4. API routes — `app/api/admin/messages/*`

All call `getOrgContext()` first (401 if absent), validate input, scope by org.

| method & path                              | purpose                                  |
| ------------------------------------------ | ---------------------------------------- |
| `GET  /api/admin/messages`                 | list threads (client poll / refresh)     |
| `POST /api/admin/messages`                 | create/open a thread `{recipientIds[], title?}` → `{threadId}` |
| `GET  /api/admin/messages/[t]/messages`    | messages for a thread (`?after=` for poll) |
| `POST /api/admin/messages/[t]/messages`    | send `{body}` → the created message       |
| `POST /api/admin/messages/[t]/read`        | mark thread read                          |
| `GET  /api/admin/messages/unread-count`    | total unread for the sidebar badge        |

---

## 5. UI — `/admin/messages`

One server page driven by `?t=<threadId>`; active nav stays `/admin/messages`
(longest-prefix match). Client orchestrator `MessagesView` owns polling, sending,
and the new-message flow.

**Two-pane on desktop, single-pane on mobile** (list ↔ conversation with a back
arrow). Cream BloomOS workspace, navy chrome.

- **Thread list** (left): stacked avatars, name (group title or other member),
  last-message preview, relative time, **bold + orange dot** when unread, count pill.
- **Conversation** (right): header with participant avatars/names; scrollable
  message area with **day dividers** ("Today"/"Yesterday"/date) and **grouped
  runs** per sender (one avatar + name per run); my messages are orange-tinted
  bubbles aligned right, others' are surface bubbles aligned left.
- **Composer**: auto-growing textarea, Enter to send / Shift+Enter newline,
  primary send button. Optimistic append on send.
- **New message**: member picker (multi-select → group, single → DM) with an
  optional group title.
- Warm empty states matching the Inbox tone.

**Delivery** — **Supabase Realtime** (`messaging_realtime.sql` adds `messages`
to the `supabase_realtime` publication). `MessagesView` opens one org-scoped
channel (`getSupabaseBrowser()`, cookie-authenticated so RLS only delivers rows
in the subscriber's threads); a new message renders instantly. Polling (list
~20s, open conversation ~6s) stays as a fallback if the socket drops, alongside
the immediate badge events (`bloomos:messages-changed`,
`bloomos:notifications-changed`) fired after send / read.

---

## 6. Sidebar

New **Messages** item under Command Center (after Inbox) with a `messages` icon
and its own unread badge, polled on the existing 50s sidebar cadence alongside
the notifications count.

---

## 7. Out of scope (v1) / future

- ~~Supabase **Realtime** subscriptions~~ — shipped (see §5 Delivery).
- Realtime badges sidebar-wide (today the open Messages page drives instant
  badge updates; elsewhere the 50s sidebar/dock poll applies).
- Edit/delete/react, typing indicators, presence, attachments, search.
- Message-level read receipts (we track per-thread `last_read_at` only).
- Push/email for messages (in-app + Inbox pointer only today).
