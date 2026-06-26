# BloomOS Recon: meetings follow-up loop (Phase 3 gate)

Mode: read-and-report. No code, no migration, no mutations. Supabase project
`kzzdtibbwsucloaoqpqa`. Grounds the Phase 3 build (`specs/bloomos-meetings-and-rhythm.md` §6, §7, §11.2).

## 1. Gmail matcher (the template to extend)

`lib/fundraising/gmail-sync.ts:96-243` (`advanceGmailJob`) is the matcher. The match and upsert:

- **Match** (`:143-148`): `supabase.from("constituents").select("id, org_id, emails").overlaps("emails", parties)`, then `if (job.org_id) …eq("org_id", job.org_id)`. `parties` = `counterpartyEmails(parsed)` (`lib/google/gmail-read.ts:57-60`) — From + To + Cc, lowercased, deduped, with staff (`@ambitionangels.org`) addresses dropped.
- **Upsert** (`:164-183`): into `interactions`, `onConflict: "external_source,external_id,constituent_id", ignoreDuplicates: true`. One row per matched constituent; all share the message's `external_id`.
- **Row fields** (`:164-179`): `external_source:"gmail"`, `external_id: parsed.messageId`, `kind:"email"`, `direction`, `subject`, `thread_id`, `body_preview: snippet`, `occurred_at`, `matched_email: (c.emails).find(e => parties.includes(e.toLowerCase())) ?? parties[0]`, `logged_by:"gmail"`.
- **`is_private`**: hardcoded `false` (`:178`). Not derived.
- **`shannon_present`**: `shannonPresent(parsed)` (`gmail-read.ts:39-41`) — tests raw From/To for local-part `shannon` @ staff domain (`:31-35`). Hardcoded single-person concept.
- Zero matches → counted as skipped and dropped (`:154-157`); there is **no unmatched tray** today.

`interactions` columns (live): `org_id, constituent_id, kind, direction, subject, thread_id, body_preview, occurred_at, matched_email, logged_by, external_source, external_id, is_private, shannon_present, notes, created_at`.

**Reusable as-is? Mostly, as a template, but it needs:** a `meeting` external_source; a real `is_private` derivation (not a constant); a generalized attendee-flag instead of the hardcoded `shannon_present`; **partner-side matching** (Gmail only hits constituents); and a kept "unmatched" tray instead of dropping no-match meetings. The `org_id` filter is present and must be carried over (it is not optional for tenant 2).

## 2. Partner matching — NOT FOUND (confirmed)

No code matches an email/attendee to `partner_contacts.email`, `partners.champion_email`, or `partners.domain`. `champion_email` appears only as a type field (`app/admin/partners/_lib/partners.ts:19`); the partners routes are CRUD. Phase 3 must build partner matching new.

`partners` has `domain, champion_email, name`; `partner_contacts` has `email, partner_id, org_id` (+ `external_source, external_id` already present). **`partner_interactions` lacks `external_source` / `external_id`** (live columns: `partner_id, contact_id, kind, notes, occurred_at, logged_by, org_id`) — so the ledger's `add_external_ids_to_partner_interactions` migration is required for partner-side dedup.

## 3. calendar_events.attendees — rich enough to match on email (yes)

Written by `lib/agenda/calendar-sync.ts:54-62`. Each attendee: `{ email, displayName, responseStatus, organizer }`. Real row sample:
`[{"email":"seth.linden@gmail.com","organizer":true,"responseStatus":"accepted","displayName":null}, {"email":"remi@ambitionangels.org","organizer":false,...}]`.

- **`is_external`** (`:60-62`): `attendees.some(a => a.email && !a.email.endsWith("@"+domain))`. Reliable; 24 of 39 live events are external.
- **Org-internal** is determined by the org email domain — `orgs.settings.email_domain`, default `ambitionangels.org` (`calendar-sync.ts:31-35`). The meeting matcher should reuse this, not the Gmail `STAFF_DOMAIN` constant.
- Dedup against `/meet` bookings already happens for the agenda view on `google_event_id` (`lib/agenda/service.ts:73-103`, `:101-103`); the meeting matcher must dedup the same way so a booked meeting isn't surfaced twice.

## 4. Meetings nav + what moves to settings

`app/admin/_components/Sidebar.tsx:41` — under "Operations": `{ label: "Meetings", icon: "meetings", href: "/admin/meet" }`. That points at the **booking admin** (`app/admin/meet/MeetAdmin.tsx`, with `CandidatesQueue.tsx`, `MarkBooked.tsx`) — the Calendly-clone outbound booking page, not a record of real meetings. Phase 3 reframes this nav item to the new records surface and retires the `/meet` booking admin into settings.

## 5. Where the coverage exception list slots into the briefing

The briefing is a deterministic signal-source engine. Pure source functions in `lib/admin/briefing/sources/index.ts` each take a typed input + `SourceCtx` and return `BriefingItem[]` (`lib/admin/briefing/types.ts:25-48`); `gather.ts` fetches the inputs and `engine.ts` ranks/caps/renders. Existing sources are the exact model: `tasksSource` (`:99-126`), `complianceSource` (`:141-179`), `followupsSource` (`:349-372`).

A meeting-coverage exception list slots in as a **new signal source** (e.g. `meetingsSource`) emitting one `BriefingItem` ("N meetings in M days with no follow-up", deepLink `/admin/meetings`). `BriefingSource` (`types.ts:12-21`) already includes `"followups"`; add `"meetings"` or reuse it. Wire the input in `gather.ts` (alongside `fundraising`/`followups` at `:183-189`). The separate always-on **fundraising moves** section (`lib/admin/briefing/fundraising.ts`, model `fr_nba_suggestions`) is the precedent for the Reed-suggested-tasks staging pattern.

## 6. Transcript / upload precedent

No paste-and-parse-a-transcript path exists, but there **is** a file-import precedent: `app/api/admin/finance/import/route.ts` and `app/api/admin/finance/budget/import/route.ts` (CSV import + parse on submit), plus `app/api/admin/report/route.ts`. No Supabase Storage usage found in `app/api/admin/**`. For v1, **paste-into-textarea + parse server-side** (no binary storage) mirrors the finance-import shape and matches the spec's "upload-and-parse is v1, no Read.ai dependency" (§5, §10.4).

---

## SUMMARY

1. **Matcher reusable?** As a template, yes — but must add a `meeting` source, derived `is_private`, generalized attendee-flags (not hardcoded `shannon_present`), partner matching, and an unmatched tray. Keep the `org_id` filter.
2. **Partner matching exists?** No — build new. `partner_interactions` needs `external_source`/`external_id` added.
3. **attendees rich enough to match on email?** Yes — `{email, displayName, responseStatus, organizer}`; `is_external` reliable; internal = org `email_domain`. Dedup vs `/meet` on `google_event_id`.
4. **Meetings nav points where / what moves?** `Sidebar.tsx:41` → `/admin/meet` (booking admin); reframe to the records surface, retire booking admin to settings.
5. **Coverage list slots where?** A new deterministic signal source in `lib/admin/briefing/sources/index.ts` (model: `followupsSource`), wired through `gather.ts`; `fr_nba_suggestions` is the staging-table precedent.
6. **Upload precedent?** No transcript path; finance CSV import is the parse-on-submit precedent. v1 = paste-and-parse, no storage.
