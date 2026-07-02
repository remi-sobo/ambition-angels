# Spec: Comms v2 (mail merge and campaign engine)

**Status:** v1.1, revised after Phase 0 recon (2026-07-01). Supersedes v1.0 draft.
**Repo location:** `specs/comms-v2-mail-merge.md`
**Author:** Claude (architect), for Remi

---

## Changelog: v1.0 → v1.1

Phase 0 recon corrected the spec in eight places. Live DB checks (journeys: 0 rows, journey_enrollments: 0, email_sends: 0, do_not_contact: 0 constituents) confirmed nothing is in flight, so every correction is design-level, not data-migration-level.

1. Unsubscribe already exists end to end (HMAC per-constituent token, public endpoint, footer with physical address + EIN). v1.1 rewires its destination, keeps its token format, and fixes its secret handling. The v1.0 plan to introduce per-send tokens is dropped.
2. A journey engine already exists and runs hourly on the service-role client. Phase 6 becomes a retrofit (ledger + org identity), not a greenfield build. It's currently idle (zero journey rows), which is why it's safe to touch shared code.
3. The comms renderer (`lib/fundraising/comms-email.ts`) is shared by campaigns and journeys. Any Phase 1 change to it ships into journey sends automatically. Acceptable now (idle engine), but named.
4. From-identity is a hardcoded constant, `careers@mail.ambitionangels.org`, in three files. `org_comms_settings` replaces the constant in all three, plus reply-to (currently absent everywhere).
5. `mail.ambitionangels.org` is already the from-domain in code; the Resend-side domain setup is likely already done. Remi confirms in the dashboard rather than re-doing Step 1 of the walkthrough.
6. org_id sequencing list grows: campaign inserts, segment inserts, email_sends upserts, and the journeys cron enrollment upserts all rely on column defaults. All four commit explicit org_id before the default-drop migration. The existing ratchet test (`supabase/tests/tenant-default-ratchet.sql`) baseline shrinks in the same PR so the drop is enforced.
7. Status vocabularies are check constraints, not free text: email_sends `pending|sent|failed|skipped`, email_campaigns `draft|sending|sent`. Phase 3 alters both constraints. The campaign-level claim-by-UPDATE guard that already exists is kept and mirrored at send-row level.
8. `UNSUBSCRIBE_SECRET` already exists as the token secret; the proposed `COMMS_UNSUB_SECRET` is dropped. Its fallback chain (`UNSUBSCRIBE_SECRET || SUPABASE_SERVICE_ROLE_KEY || "dev-unsubscribe-secret"`) is a fail-open bug fixed in Phase 1: require the env, fail closed.

**Open decision 1 is now decided** (it stopped being open when we learned production implements one side of it and that zero unsubscribes exist, making the switch free): unsubscribe writes to `email_suppressions`, not `do_not_contact`. The recipient resolver honors both. `do_not_contact` returns to being a human, all-channel CRM flag. The existing per-constituent token stays; campaign attribution comes from a `c=<campaign_id>` query param on the link, not from per-send tokens.

---

## Problem statement

Remi wants to send personalized email at scale from inside BloomOS: the Mailmeteor experience (personal-looking, merge-field emails that land in the inbox because they read like a human wrote them) combined with real targeting (segments built from giving history, which Mailmeteor and Mailchimp can't see but Bloom knows natively). The Comms feature (Epic I) can technically send through Resend but has never been used: zero campaigns, zero sends, zero segments. The recon shows it's closer to safe than the v1.0 spec assumed (footer, address, unsubscribe link exist) but still not trustworthy: no List-Unsubscribe headers, no suppression list (unsubscribe nukes the all-channel DNC flag), no bounce or complaint feedback loop, a fail-open token secret, a hardcoded from-identity with no reply-to, no scheduling, no resumability (a mid-send crash strands the campaign), and a segment "builder" that's a six-key filter with no UI for giving-history rules. The gap between "the button exists" and "we trust the button" is this spec.

## Who's affected

- **Remi**: donor appeals, lapsed re-engagement, event invitations, without a Mailmeteor/Mailchimp bill or context switch.
- **Shannon**: recurring comms (newsletters, follow-ups) once the flow is safe to hand off.
- **Donors and constituents** (2,432 with an email, of 3,568): one-click unsubscribe that doesn't also block phone and mail stewardship; never emailed after opting out or bouncing.
- **Future tenants**: per-org identity, settings, and suppressions or the module can't ship as SaaS.

## Current behavior (per Phase 0 recon, 2026-07-01)

- **Send path** (`app/api/admin/comms/[id]/send/route.ts`): session client, resolves recipients from a segment (limit 10k constituents, in-memory gifts aggregation), skips `do_not_contact` and missing email, hard cap 2,000 recipients, campaign-level claim-by-UPDATE double-send guard, sends one email per call in chunks of 25, writes `email_sends` as an after-the-fact ledger (`sent|failed`), no `maxDuration`, no resume: a crash strands `sending` status with a partial ledger.
- **Identity**: hardcoded `"Ambition Angels <careers@mail.ambitionangels.org>"` in send, test, and journeys cron. No reply-to anywhere. 16 ad hoc `new Resend(...)` call sites repo-wide.
- **Unsubscribe**: HMAC per-constituent token (`lib/fundraising/unsubscribe.ts`), public `/api/unsubscribe`, flips `do_not_contact`. Secret falls back to the service-role key, then to a public dev string. Footer (address, EIN, unsub link) built in `lib/fundraising/comms-email.ts`, shared by campaigns and journeys.
- **Journeys**: hourly cron on the service-role client; enrolls on `first_gift` and `lapsed` triggers, advances steps, honors DNC, has a double-thank guard against the acknowledgment matrix. Writes no send ledger. Idle: zero journey rows exist.
- **Missing entirely**: List-Unsubscribe headers, Resend webhooks, bounce/complaint handling, suppression list, scheduling, tags, batch API usage.
- **org_id**: no comms write path sets it; four paths ride the column defaults (set dynamically by slug lookup in migrations). A ratchet test tracks which tables still have defaults.
- **Merge fields**: `{{first_name}}` only, fallback "friend"; test sends personalize with a literal "there", not a sample recipient.
- **Statuses**: check constraints, email_sends `pending|sent|failed|skipped`, email_campaigns `draft|sending|sent`.
- **Cron**: 9 jobs in vercel.json, established pattern (GET, `Bearer ${CRON_SECRET}`, `maxDuration = 60`). Tightest cadence today: every 15 minutes.

## Desired behavior

Unchanged from v1.0: build a segment with a live count, write a merge-field plain-text email, test against a real sample recipient, schedule it, and it sends in resumable batches with per-recipient tracking; unsubscribes/bounces/complaints self-suppress per org; a report shows delivered/bounced/complained/clicked; identity and footer are per-org rows; templates and journeys follow.

## Scope

**In (v1, Phases 1–4):**
- `org_comms_settings` replacing the hardcoded from constant in send, test, and journeys cron; reply-to introduced.
- `email_suppressions`; `/api/unsubscribe` rewired to write it (with campaign attribution via query param); resolver honors suppressions AND `do_not_contact`.
- Secret hardening: `UNSUBSCRIBE_SECRET` required, fallback chain removed, fail closed.
- List-Unsubscribe / List-Unsubscribe-Post headers in the shared renderer path.
- Resend webhooks → `email_events`, auto-suppression, campaign report, `v_campaign_stats` (security_invoker).
- Queue-based batched sending (Resend batch API), scheduling, claim-by-UPDATE at send-row level, reaper, `maxDuration`.
- Explicit org_id in the four default-riding write paths, then default drops on `email_campaigns` and `segments`, ratchet baseline shrunk.
- Segment builder v2: extend the existing six-key compiler into a rules model, unify with the donors-export filter (one lib, two callers), giving-history rules, live count, recipient preview. Zero existing segment rows: the jsonb shape is free to change.
- Test sends render against a real sample recipient from the segment.

**In (v2, Phases 5–6):**
- `email_templates` + react-email branded HTML, preview, multipart.
- Journey retrofit: sends go through the Phase 3 queue (gaining the ledger), identity from org_comms_settings, org_id explicit, minimal activate/pause UI. The existing engine's enrollment/advance logic is kept.

**Out:** drag-and-drop designer (permanently), A/B testing, SMS, Gmail-API transport (deferred; revisit for the fr_email_drafts one-to-one flow), per-tenant Resend domain onboarding UI, consolidating the 16 Resend call sites (worth a small refactor ticket, not this module).

## Architecture sketch

Unchanged from v1.0 in shape, with four corrections:

```
compose · schedule · segment builder · report · settings   (session client)
        │
segments.definition (rules jsonb, v2 shape)
        │  compile: lib/fundraising/segments.ts, extended in place,
        │  shared with donors export (one compiler, two callers)
        ▼
recipients = constituents ∩ has email − email_suppressions − do_not_contact
        │  Send / cron picks up scheduled_at ≤ now
        ▼
enqueue email_sends status='pending'      ◄── existing status vocabulary reused:
        │                                      pending IS the queue state
        ▼
send worker (cron */5, maxDuration 60, CRON_SECRET pattern)
  · claim: UPDATE … WHERE status='pending' LIMIT 100 RETURNING
    (mirrors the campaign-level guard that already exists)
  · re-check suppression at send time
  · personalize() + footer + List-Unsubscribe headers (shared renderer:
    journeys inherit this for free)
  · identity from org_comms_settings, never a constant
  · Resend BATCH API, tag = send_id
  · terminal write: sent | failed | skipped; reaper re-queues rows
    claimed >15 min without a terminal state
        │
        ▼
Resend webhooks (Svix) → /api/webhooks/resend (service-role; org_id derived
  from the send row, never a constant) → email_events → auto-suppress on
  hard bounce / complaint
        │
/api/unsubscribe?t=<per-constituent HMAC>&c=<campaign_id>
  → email_suppressions upsert (reason=unsubscribed, source=c)
  → confirmation page; do_not_contact untouched
v_campaign_stats (security_invoker) over email_events
journeys cron (existing, hourly) retrofitted in Phase 6 to emit through the queue
```

**Schema changes (reviewable SQL per phase, applied by Remi):**

| Object | Phase | Notes |
|---|---|---|
| `org_comms_settings` | 1 | org_id PK no default, from_name, from_email, reply_to, mailing_address, footer_text, daily_send_cap int default 2000; RLS via `private.has_permission` |
| `email_suppressions` | 1 | org_id no default, email citext, reason check (unsubscribed/hard_bounce/complaint/manual), source_campaign_id, created_at; unique (org_id, email) |
| default drops | 1 | email_campaigns, segments; sequenced after the four code paths commit explicit org_id (incl. journeys cron); ratchet baseline shrunk same PR |
| `email_events` | 2 | org_id no default, send_id, campaign_id, constituent_id, event_type, meta jsonb, occurred_at; unique (send_id, event_type, occurred_at); RLS read via has_permission, writes service-role only |
| `v_campaign_stats` | 2 | security_invoker |
| `email_campaigns` alter | 3 | add scheduled_at, from overrides nullable, preheader; check constraint rebuilt: draft/scheduled/sending/sent/canceled |
| `email_sends` alter | 3 | check constraint rebuilt: pending/sending/sent/failed/skipped/suppressed; add claimed_at, resend_id |
| `email_templates` | 5 | org_id no default, name, kind, definition jsonb |
| journeys | 6 | no schema change expected (current_step, next_run_at already exist); ledger comes from routing sends through email_sends |

## Staged build order

**Phase 1 — Compliance floor and identity** — `comms-v2-compliance-floor`
Migration: org_comms_settings (seed AA row from the current hardcoded values), email_suppressions, default drops (this migration is split in two files if Remi prefers to apply the drops only after the code deploy is verified).
Code: explicit org_id in the four write paths; org_comms_settings replaces the from constant in send/test/journeys-cron and adds reply-to; `/api/unsubscribe` writes email_suppressions (keeps flipping nothing else), campaign attribution param added to footer links; resolver excludes suppressions; secret fallback chain removed, boot-time assert on UNSUBSCRIBE_SECRET; List-Unsubscribe + List-Unsubscribe-Post headers in the send paths; test send personalizes with a real sample recipient; ratchet baseline shrunk; settings section on the Comms page.
Operational (Remi): confirm mail.ambitionangels.org is verified in Resend (code already assumes it), confirm UNSUBSCRIBE_SECRET is set in Vercel prod and preview, confirm/replace the from address (see open decision A), confirm DMARC exists on the root.

**Phase 2 — Delivery events and reporting** — `comms-v2-events`
As v1.0: webhook endpoint (Svix verification, `RESEND_WEBHOOK_SECRET`), email_events, auto-suppression, report page, v_campaign_stats. Webhook registered in Resend after deploy.

**Phase 3 — Send queue and scheduling** — `comms-v2-queue`
As v1.0, adjusted: reuse `pending` as the queue state; rebuild both check constraints; enqueue-on-send/schedule; */5 cron worker following the CRON_SECRET pattern with maxDuration 60; Resend batch API with send_id tags; send-time suppression re-check; reaper for stale claims; daily cap enforced from org_comms_settings; schedule/cancel UI. The existing 25-chunk `Promise.allSettled` loop and the no-maxDuration send route are retired.

**Phase 4 — Segment builder** — `comms-v2-segments`
Extend `lib/fundraising/segments.ts` into a rules compiler (match all/any; total_given, gift_count, last/first_gift_date, largest_gift, is_recurring, campaign/appeal attribution, tags, lapsed derived from org fiscal-year start); unify the donors-export filter onto the same compiler; move gifts aggregation into SQL (the in-memory 10k-row aggregation won't survive growth); builder UI with live count, recipient preview, and an exclusions line (N suppressed, M do-not-contact).

**Phase 5 — Branded HTML templates** — `comms-v2-templates` (unchanged from v1.0)

**Phase 6 — Journey retrofit** — `comms-v2-journeys`
Route journey sends through the Phase 3 queue (per-recipient ledger for free), identity from org_comms_settings (already done in Phase 1 if the constant replacement covered the cron), org_id explicit (done in Phase 1), keep the existing enrollment/advance/double-thank logic, add activate/pause UI and enrollment counts. Gate: the acknowledgments v2 first-gift ownership decision, though the recon shows the code already implements a working answer (journey defers to a recent ack); the decision may reduce to ratifying it.

## Definition of done (v1 = Phases 1–4)

- Unsubscribe click creates an email_suppressions row and does NOT set do_not_contact; the constituent is excluded from the next enqueue with the exclusions line proving it.
- With UNSUBSCRIBE_SECRET unset in a dev environment, the app refuses to build/serve unsubscribe links rather than falling back to a guessable secret.
- Gmail "show original" on a campaign email shows List-Unsubscribe and List-Unsubscribe-Post headers, the physical address, and the EIN.
- A hard bounce produces an email_events row and a suppression with reason hard_bounce, no human action.
- A 2,000-recipient scheduled campaign completes with every email_sends row terminal and zero rows in pending/sending an hour after completion; killing the worker mid-run and letting the next cron tick resume it loses nothing and double-sends nothing (verified by unique resend_ids).
- Segment live count equals enqueued rows at send time.
- information_schema shows no org_id default on email_campaigns or segments; the ratchet test enforces it.
- No file in the repo contains `careers@mail.ambitionangels.org` (or any from-address literal) after Phase 1.
- Second-tenant thought test: settings, suppression, campaign, segment rows under a hypothetical org_id touch zero AA rows through RLS.

## Failure modes to watch for

Carried from v1.0 (domain reputation burn, double-send, zombie sends, webhook replay, suppression race, token forgery, org_id trap, open-rate theater, merge-field failure) plus three from recon:

10. **Shared-renderer blast radius.** comms-email.ts changes ship into journey sends invisibly. Manifest: a future active journey sends with a half-finished footer or header change. Mitigation: renderer changes carry a journey-path test; Phase 6 is when journeys go live-supported, not before.
11. **Old unsubscribe links.** If any live path (stewardship milestones, operator email) already embeds per-constituent tokens, those links must keep working after the endpoint rewire. Mitigation: token format is unchanged, only the write destination changes, so old links work by construction; verified in Phase 1 review by checking every `unsubscribe.ts` import site.
12. **Compiler divergence regression.** Unifying the export filter and resolveRecipients onto one compiler can silently change who an existing export returns. Mitigation: golden tests comparing old and new filter output on the six legacy keys before the switch.

## Open decisions

- **A. From address.** `careers@mail.ambitionangels.org` is what's live; it reads like an HR inbox, not a person. Recommend `remi@mail.ambitionangels.org` with reply-to `remi@ambitionangels.org` for donor comms. Needs Remi's call, and it's a one-row seed value, not code.
- **B. Lapsed definition** (unchanged): prior FY gave, current FY nothing, parameterized on org fiscal-year start. Confirm AA's definition.
- **C. Daily cap seed** (unchanged): 2,000 to match the existing hard cap. Confirm.
- **D. Suppression backfill**: none needed (zero unsubscribes exist). Named only to record that we checked.

## Effort candor

Phase 1 grew from v1.0 (it absorbed the identity refactor, the secret fix, and the journeys-cron org_id work) but it's still a few evenings, and it's all mechanical. The order of operations matters more than the code: tables SQL → deploy code → verify → default-drops SQL. Phase 3 remains the engineering-care phase; Phase 4 remains the biggest and most valuable. The recon saved us from two real mistakes (breaking delivered unsubscribe links that turned out not to exist yet, and greenfielding a journey engine that already runs), which is the gate doing its job.
