// Gmail → interactions sync kill switch. Client-safe (no server imports) so the
// admin button can read it too.
//
// PAUSED since 2026-11-21. The sync reads the mailbox with gmail.readonly, a
// restricted scope, on the "bloom / meet" OAuth client that is under Google
// verification, and the published privacy policy says BloomOS cannot read the
// mailbox. Until the sync moves to a separate Internal OAuth client (or is
// retired), it stays off.
//
// To turn it back on: set this to false AND restore the cron entry in
// vercel.json ({ "path": "/api/cron/gmail-sync", "schedule": "45 * * * *" }).
// Nothing in the database was deleted: gmail_sync_jobs (and its watermark) and
// every logged interaction are intact, so the next run resumes incrementally.
export const GMAIL_SYNC_PAUSED = true;

export const GMAIL_SYNC_PAUSED_MESSAGE =
  "Email sync is paused. BloomOS is not reading the mailbox while Google reviews the app.";
