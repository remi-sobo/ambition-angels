// Gmail → interactions sync kill switch. Client-safe (no server imports) so the
// admin button can read it too.
//
// Paused 2026-11-21 because the sync read the mailbox with gmail.readonly on
// the "bloom / meet" OAuth client (under Google verification; the privacy
// policy says BloomOS cannot read the mailbox). Back ON 2026-11-23: the sync
// now reads only through a separate Internal OAuth client
// (lib/google/gmail-sync-oauth.ts), and remi@ambitionangels.org is connected.
//
// To pause again: set this to true AND remove the /api/cron/gmail-sync entry
// from vercel.json. tests/gmail-sync-paused.test.ts keeps the two in step.
//
// Turning it on took:
//   1. Set GMAIL_SYNC_CLIENT_ID / GMAIL_SYNC_CLIENT_SECRET (the Internal client)
//      in Vercel and redeploy.
//   2. Today's Moves → "Connect mailbox" (works while paused).
//   3. Set this to false AND restore the cron entry in vercel.json
//      ({ "path": "/api/cron/gmail-sync", "schedule": "45 * * * *" }).
// Nothing in the database was deleted: gmail_sync_jobs (and its watermark) and
// every logged interaction are intact, so the next run resumes incrementally.
export const GMAIL_SYNC_PAUSED = false;

export const GMAIL_SYNC_PAUSED_MESSAGE =
  "Email sync is paused. BloomOS is not reading the mailbox while Google reviews the app.";
