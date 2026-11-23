// Gmail → interactions sync kill switch. Client-safe (no server imports) so the
// admin button can read it too.
//
// PAUSED since 2026-11-21. The sync reads the mailbox with gmail.readonly, a
// restricted scope, on the "bloom / meet" OAuth client that is under Google
// verification, and the published privacy policy says BloomOS cannot read the
// mailbox. The sync now reads only through a separate Internal OAuth client
// (lib/google/gmail-sync-oauth.ts); it stays off until that is set up.
//
// To turn it back on:
//   1. Set GMAIL_SYNC_CLIENT_ID / GMAIL_SYNC_CLIENT_SECRET (the Internal client)
//      in Vercel and redeploy.
//   2. Today's Moves → "Connect mailbox" (works while paused).
//   3. Set this to false AND restore the cron entry in vercel.json
//      ({ "path": "/api/cron/gmail-sync", "schedule": "45 * * * *" }).
// Nothing in the database was deleted: gmail_sync_jobs (and its watermark) and
// every logged interaction are intact, so the next run resumes incrementally.
export const GMAIL_SYNC_PAUSED = true;

export const GMAIL_SYNC_PAUSED_MESSAGE =
  "Email sync is paused. BloomOS is not reading the mailbox while Google reviews the app.";
