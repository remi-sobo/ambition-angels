# BloomOS Recon: task→calendar write (Phase 4 gate)

Read-and-report gate before the one-way calendar write. Three seams, to design the echo-skip precisely.

## 1. The write functions (`lib/google/calendar.ts`)

`createEvent` (`:103-124`), `updateEvent` (`:153-169`), `cancelEvent` (`:131-145`) all call `getCalendarClient()` (the **env** account, `lib/google/auth.ts`) and write to a hardwired `CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary"` (`:3`). They set `sendUpdates: "all"` and **no `extendedProperties`**. So today every write is the single env account + primary calendar, untagged. Phase 4 must parametrize auth + calendar off the per-user connection and tag the event.

## 2. The per-user connection auth (`lib/google/connection.ts`)

`connections` (provider `google_calendar`, RLS deny-all → service-role only) holds an AES-GCM-encrypted refresh token per user. `calendarClientFromRefreshToken(refreshToken)` (`:117-124`) builds an authed `calendar_v3` client from `GOOGLE_CLIENT_ID/SECRET` + the token. `listActiveCalendarConnections()` (`:53-72`) returns all decrypted connections (`{orgId, userId, refreshToken, calendarId}`). **Gap:** no single-user getter — Phase 4 adds `getActiveCalendarConnection(userId)`.

## 3. The sync upsert (`lib/agenda/calendar-sync.ts`)

`mapEvent` (`:46-81`) builds rows with `source: "google"` and upserts on `onConflict: "owner_user_id,google_event_id"` (`:117`). The stale-delete (`:124-131`) removes only `source = "google"` rows in-window not touched this run. It does **not** read `extendedProperties`.

### Echo-skip design (decided here)
- Every BloomOS write carries `extendedProperties.private.bloomos_task_id = <task id>`.
- `mapEvent` reads that property; when present → `source = "bloomos"` (not `"google"`).
- The google stale-delete (`source = "google"`) never touches BloomOS blocks; the regular sync still re-imports them (idempotent on `owner_user_id,google_event_id`), keeping `synced_at` fresh, so they're never stale-deleted either.
- On write, BloomOS **also** upserts the `calendar_events` row immediately (`source='bloomos'`) and stores its id on `ops_tasks.calendar_event_id`, so the grid and the link don't wait for the next 15-min sync. The (owner_user_id, google_event_id) key keeps the immediate write and the later sync consistent.
- BloomOS-owned blocks (those with `bloomos_task_id`) are authoritative; imported google events are read-only context. Deleting a block unschedules the task (clears `calendar_event_id`, `planned_day`) — it does not delete the task.

## Migration
`add_calendar_event_id_to_ops_tasks` — `ops_tasks.calendar_event_id uuid references calendar_events(id) on delete set null`. The drag-into-block link.
