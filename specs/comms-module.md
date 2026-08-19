# specs/comms-module.md — Comms: story bank, editions, composer

Status: draft for Remi review, revised 2026-08-19 after the SafeSpace comms coaching session (Susan, Aris). That session field-tested the concepts with a real tenant before a line of code exists; amendments are integrated below and listed in section 14. Recon against live schema completed 2026-08-19 (project kzzdtibbwsucloaoqpqa). Build does not start until the Phase 0 prompt in section 13 has run in Claude Code and reported.

## 1. Problem statement

Small nonprofits know comms is slow-lane fundraising: every newsletter, LinkedIn post, and donor update is training supporters on what the org does and why it matters. But the raw material (wins, stories, photos, quotes) evaporates. It lives in camera rolls, Slack threads, and staff memory. When the quarterly newsletter comes due, the ED scrambles, writes from recall, and ships something thinner than the quarter deserved. Sector data backs the pain: the average nonprofit sent 50 emails per subscriber in 2025 and raised $2.40 per subscriber, welcome sequences pull roughly 3x the click-through of standard blasts, and only about 1 in 6 comms teams is growing. The buyer is one person doing comms with 30% of their week.

Standalone story tools (MemoryFox, GoodSeeker, Storyraise) exist but are disconnected purchases: they hold stories without the metrics, the donors, or the program data. CRMs with comms bolted on (Bloomerang, Virtuous) compose email to segments but have no concept of a story as a first-class, consented, reusable object. Nobody connects the story to the outcome number to the donor record to the ask. BloomOS holds all four in one schema. That is the wedge.

There is also a compliance hole in the category. Youth-serving orgs (AA, SafeSpace, Young Life EPA: three of our four tenants) legally and ethically need consent tracking with expiry and revocation on any participant story or photo. No CRM has it. We make consent a structural property of the story object: a story without current consent physically cannot flow into a draft or a send.

## 2. Who's affected

- The ED/CEO (Remi at AA, Susan at SafeSpace, tenant 47's ED): assembles the quarterly update, posts on LinkedIn, reports to the board and funders.
- Program staff: witness the wins but have no 15-second way to capture them. They are the supply side of the story bank.
- Ops lead (Shannon's role): sends the campaigns, owns the suppression list, fields the "can we still use that photo" question.
- Donors and funders: the audience. Better-grounded comms is the product's fundraising claim.
- Participants and their guardians: the people in the stories. Consent tracking protects them first, the org second.

## 3. Current behavior (from live schema recon)

- A working plain-text send path exists: `email_campaigns` (org-scoped, status, counts), `email_sends`, `email_suppressions`, `segments` (jsonb definition), `org_comms_settings` (from_name, from_email, reply_to, mailing_address, footer_text, daily_send_cap, correctly keyed per org). UI at `/admin/fundraising/comms` with test-send, segment gating, and DNC/unsubscribe honored in the send path.
- `campaigns` / `appeals` handle gift attribution. `ack_templates` handles thank-you templates with an `applies_when` jsonb.
- No table represents a story, a win, a content piece, a consent record, an editorial calendar, or a media asset for comms. `documents` exists (org-scoped, storage_path, mime, doc_type, expires_at) but is ask-attachment plumbing.
- `metric_definitions` / `metric_snapshots` exist and are the source for "by the numbers" content.
- Permissions run through `role_permissions` and `public.has_permission(p_org uuid, p_perm text)` (delegating to `private.has_permission`). Roles: owner, admin, staff, finance, board_viewer. The known gap: staff is a bundle with no way to separate participant-record access. This spec introduces the first split permission.
- `ops_tasks` supports `linked_entity_type` / `linked_entity_id`, so comms work items can become real tasks.
- Trap check: 13 tables still default `org_id` to AA's UUID. One of them, `bv_newsletter_subscribers`, is comms-adjacent. No new table in this spec carries a default, and Phase 1 includes dropping that default.
- `fr_email_drafts` keys on `hubspot_contact_id`. It is legacy staging-era plumbing; this module does not touch or extend it.

## 4. Desired behavior

A top-level Comms section with three surfaces:

1. **Story bank.** Anyone with capture rights logs a win in 15 seconds from a phone: title, a paragraph, optional photo, optional subject. Stories carry status, tags, subject links, consent state, and a rank. The ED opens the bank before writing anything and finds the quarter's best material already sorted.
2. **Editions.** A quarterly newsletter (or monthly update, or annual report letter) is an edition: an instance of a format. A format is a named, ordered set of slots (lead story, by the numbers, ask, thank you, what's next) stored as data per org. Filling an edition means dragging stories into slots and picking metrics; the format supplies the consistency the ED can't design alone.
3. **Composer.** One story, many outputs. From any approved story: a LinkedIn post, a donor thank-you paragraph, a grant report anecdote, a newsletter section. AI drafts are grounded in the story text plus real metric snapshots, run through the redaction boundary, and always land as drafts for human approval. Nothing auto-publishes, nothing auto-sends.

Consent is enforced structurally: the composer and edition slots read only from a publishable view. A story whose consent is expired, revoked, or missing (when it has an identifiable subject) is visible in the bank with a blocked chip but cannot be pulled into any output.

The existing send path is reused, not duplicated. Publishing an edition compiles it into an `email_campaigns` row (plain text v1) that flows through the existing test/send/suppression machinery.

## 5. Scope

**In**
- Tables: `stories`, `story_subjects`, `story_consents`, `story_media`, `comms_formats`, `comms_editions`, `comms_edition_slots`, `comms_outputs`. All org-scoped, RLS'd, no column defaults on `org_id`.
- Two new permission keys: `comms.manage` (create/edit/rank stories, build editions, run composer) and `comms.subjects.read` (see and link identifiable participant subjects). The second is the first split off the staff bundle.
- Story capture (mobile-first modal), bank list with drag rank plus computed suggestions, story detail, consent recording and status chips.
- Composer for short-form outputs (LinkedIn post, thank-you paragraph, grant anecdote) with metric grounding and the redaction boundary.
- Format library (4 starter formats seeded per org at enable time, including the news flash), a format editor (add/remove/rename/reorder slots, change kinds, toggle required), edition builder, edition compile to `email_campaigns`.
- Usage tracking (`comms_outputs.used_at`, edition sent linkage) feeding the suggestion score.
- Dropping the `org_id` default on `bv_newsletter_subscribers`.

**Out**
- Social OAuth publishing (LinkedIn/Instagram APIs). Export only: copy to clipboard, download.
- HTML/MJML newsletter rendering and templating. v1 composes content; the sender stays plain text with `{{first_name}}`. HTML rendering is its own future spec.
- Video capture/hosting. Photos only in v1 (`story_media` is designed to accept video later).
- Public story submission forms (participant-facing). Future phase; raises consent-of-submission questions we shouldn't rush.
- A second email sender, editor, or suppression system of any kind.
- Reed conversational story-elicitation ("Reed interviews you about the win"). Designed for, not built; Reed's RLS prerequisites are sequenced ahead of all Reed features per the Reed spec.
- Any change to `fr_email_drafts`.

## 6. Architecture

### 6.1 Data model

All tables: `org_id uuid not null` (no default), populated from session context. RLS enabled with `has_permission` policies. Timestamps `created_at` / `updated_at` per house pattern.

**stories** — the core object.
- `id`, `org_id`, `title text not null`, `body text` (the raw paragraph; imperfect is fine), `outcome text` (nullable: "what changed because of this?", the field that trains staff to capture outcomes, not outputs; the composer weights it heavily when present), `status text` check in (`raw`, `drafted`, `approved`, `used`, `retired`), default `raw`
- `tags text[]`, `happened_on date`, `captured_by text`, `rank_order integer` (manual drag rank, nullable; null means unranked)
- `strategic_goal_id uuid null references plan_goals(id)` (optional link into the strategy tree; feeds the suggestion score and lets the strategy page someday show "stories proving this goal")
- `source text` (manual, reed, import)

**story_subjects** — who the story is about. Zero or more per story.
- `id`, `org_id`, `story_id references stories`, `subject_type text` check in (`participant`, `constituent`, `partner`, `staff`, `none`), `subject_id uuid null` (points at `students.id`, `constituents.id`, or `partners.id` depending on type; validated in the API layer, not a hard FK, same polymorphic pattern as acknowledgments v2), `display_label text` (what the story may call them under current consent, e.g. "Marcus" or "a 16-year-old participant")
- `is_minor boolean not null default false`. When true, the redaction boundary is unconditional.
- Rows with `subject_type = 'participant'` are readable only under `comms.subjects.read`; without it the API returns the story with subjects collapsed to their anonymous `display_label`.

**story_consents** — one or more per subject.
- `id`, `org_id`, `story_subject_id references story_subjects`, `scope text[] not null` (any of `first_name`, `full_name`, `photo`, `video`, `quote`, `outcome_details`)
- `requested_at date null` (when the org asked; supports the real workflow of "emailed Mom the draft and the photo, waiting to hear back"), `granted_by text null` (who signed: guardian name or "self"; null until granted), `granted_at date null`, `expires_at date null` (null = no sunset; UI nudges toward setting one), `revoked_at timestamptz null`, `evidence_document_id uuid null references documents(id)` (the scanned release or the confirming email), `notes text`
- Consent state is computed, never stored: `pending` (requested, not yet granted), `current` (granted, not revoked, not expired), `expiring` (< 30 days left), `expired`, `revoked`. A subject with no consent rows is `none`.
- Blanket intake releases (the photo/video form signed at enrollment) are recorded as a consent row with broad scope and the release as evidence. But the taught best practice, validated in the SafeSpace session, is per-story confirmation anyway: a short note to the guardian with the actual draft and photo. It is both the safer standard and a positive donor-family touchpoint ("we want people to know what your kid did"). The UI treats blanket-only coverage as publishable but nudges toward the per-story confirm on any named feature.

**story_media** — photos attached to a story.
- `id`, `org_id`, `story_id`, `storage_path text not null` (Supabase storage, per-org path prefix `comms/{org_id}/`), `mime text`, `size_bytes`, `caption text`, `kind text` check in (`photo`, `video`) default `photo`
- Upload pipeline strips EXIF (GPS coordinates on a photo of a minor is a leak vector).
- Media with an identifiable subject is publishable only when a current consent on that subject includes `photo` scope.

**comms_formats** — the reusable structure of a publication. Data rows, never code branches.
- `id`, `org_id`, `name text` ("Quarterly newsletter"), `cadence text` check in (`monthly`, `quarterly`, `annual`, `adhoc`), `slots jsonb not null`, `is_archived boolean default false`
- `slots` shape: ordered array of `{ key, label, kind, required, hint }` where `kind` in (`letter`, `story`, `metrics`, `ask`, `freeform`). `letter` is a freeform slot semantically marked as the leader's voice; its hint carries the teaching ("teach one piece of the model, in first person, signed").
- Formats are fully editable per org: add, remove, rename, reorder slots, change kinds, toggle required. The seed is a starting point, never a constraint. Seeds use generic labels; each org renames into its own vocabulary (SafeSpace turns "Program spotlight" into "Campus spotlight"; Young Life EPA might make it "Club spotlight").
- Generic seed for the quarterly newsletter (the structure taught and validated in the SafeSpace session, with org-neutral labels):
  `[{key:"letter", label:"Letter from the leader", kind:"letter", required:true, hint:"One piece of your model, personal, signed."}, {key:"person", label:"Person spotlight", kind:"story", required:true, hint:"A named person doing something. Needs current consent."}, {key:"program", label:"Program spotlight", kind:"story", required:false, hint:"What's happening in one part of the work."}, {key:"work", label:"The work", kind:"story", required:true, hint:"Something that happened since last time. Outcome, not output."}, {key:"numbers", label:"By the numbers", kind:"metrics", required:true}, {key:"next", label:"What's coming", kind:"freeform", required:false}, {key:"ask", label:"Support the work", kind:"ask", required:true, hint:"Always present, never a hard ask."}]`
- Four starter formats seeded when an org enables the module: quarterly newsletter (above), **news flash** (adhoc, one story slot plus optional photo; the "I have to tell you about this" send that should feel like a text between newsletters), monthly update, annual appeal letter. The Flourish coach edits rows through the same editor every org has, not code. This is the tier boundary working as intended: the product ships a sane default and the full editing power; the coach's hour goes to tailoring the format to the org's model, which is exactly what the SafeSpace session was.

**comms_editions** — an instance of a format.
- `id`, `org_id`, `format_id references comms_formats`, `title text` ("Fall 2026 newsletter"), `status text` check in (`planning`, `drafting`, `review`, `compiled`, `sent`, `archived`) default `planning`, `target_date date`, `email_campaign_id uuid null references email_campaigns(id)` (set at compile), `sent_at timestamptz null`

**comms_edition_slots** — the filled slots.
- `id`, `org_id`, `edition_id references comms_editions`, `slot_key text not null`, `slot_def jsonb not null` (the slot definition copied from the format at edition create: label, kind, required, hint; this is what insulates in-flight editions from later format edits), `story_id uuid null references stories(id)`, `metric_ids uuid[] null` (references into `metric_definitions`, values resolved from latest `metric_snapshots` at compile), `content text` (the drafted/edited copy for this slot), `position integer`
- Unique `(edition_id, slot_key)`.

**comms_outputs** — everything the composer produces.
- `id`, `org_id`, `story_id references stories`, `edition_id uuid null`, `channel text` check in (`linkedin`, `newsletter_section`, `thank_you`, `grant_anecdote`, `board_update`, `news_flash`, `personal_forward`), `body text not null`, `status text` check in (`draft`, `approved`, `used`, `discarded`) default `draft`, `used_at timestamptz null`, `model_grounding jsonb null` (which metric snapshot ids and story fields fed the draft, for audit)

### 6.2 Views

Both with `security_invoker = on` (house rule; plain views run as owner and bypass RLS).

**v_publishable_stories** — the only surface the composer and edition slot picker may read. A story qualifies when: status in (`approved`, `used`), and for every linked subject with `subject_type != 'none'`, consent state is `current` for at least the scopes the story's media and display labels require. A subject-free story (org-level win, partnership announcement) is publishable on approval alone.

**v_story_suggestions** — the computed rank behind the drag rank. Score components, all deterministic (no AI): freshness (happened_on recency), unused bonus (never in a `comms_outputs.used` row), strategic link bonus (`strategic_goal_id` set), consent readiness (publishable now), media bonus (has photo with photo-scope consent). Weights are constants in one place. The bank sorts by `coalesce(rank_order, big)` first, suggestion score second: a human drag always beats the machine.

### 6.3 Permissions and RLS

Two new keys in `role_permissions`:
- `comms.manage`: seeded to owner, admin, staff. Gates all writes across the eight tables and all comms UI.
- `comms.subjects.read`: seeded to owner and admin only. Gates reading `story_subjects` rows where `subject_type = 'participant'`, and the `story_consents` rows hanging off one (they carry the guardian's name and the evidence pointer). Staff see the story; the participant link renders as an anonymous placeholder with its consent state intact, so a blocked story still explains itself.

*(Named `.read`, not `.view`, per Remi at Phase 1: read/write/manage/admin/delete is the verb set every other domain uses, and a permission string baked into RLS policy bodies is expensive to rename later. Phase 0 findings §11-D.)*

RLS pattern per table (see appendix for full SQL): select requires `has_permission(org_id, 'comms.manage')` or the tighter key for subject rows; insert/update/delete require the same plus `org_id` matching session org context. Board viewers get no comms access in v1.

This is deliberately the first split permission off the staff bundle. It resolves the same access-control gap the SafeSpace recon flagged as a compliance gate, in a small, testable slice, and it establishes the pattern the fundraising/program split will follow.

### 6.4 The AI boundary (redaction)

Hard rule, inherited from SafeSpace sections 7 to 9 and applied platform-wide: individually identifiable participant data never reaches a model.

Implementation: a single server-side function, `redactStoryForModel(story)`, is the only way story content enters a Claude API call. It:
1. Replaces each subject's name/label with a neutral placeholder ("a 16-year-old participant", "a program alum") built from `display_label` rules, unconditionally when `is_minor`, and whenever consent scope lacks `full_name`.
2. Strips media entirely (no images to the model in v1).
3. Passes metric values by id resolution server-side (the model sees "47 teens served this quarter, up from 31", never a query capability).
4. Records what was sent in `comms_outputs.model_grounding` for audit.

Composer AI features are tier-gated to Bloom Grow (they ride the Reed/AI entitlement). Bloom base gets the story bank, editions, formats, and manual composition: still a complete, sellable module without a single model call.

### 6.5 Send path reuse

Compile does three things: resolves each slot to final text (slot `content` wins; story body is the fallback), stitches slots in format order with the org's footer from `org_comms_settings`, and inserts an `email_campaigns` draft with the edition title as name. From there the existing UI owns segment attachment, test send, and send. When the campaign's status flips to sent, a lightweight sync marks the edition `sent`, stamps `sent_at`, and flips each slotted story to `used`. One sender, one suppression list, one deliverability reputation.

### 6.6 Tenant genericity check

- Formats, slots, and cadences: data rows per org. Young Life EPA can run a monthly "leader letter" with different slots than AA's quarterly, zero code.
- Subject types: `participant` deliberately, not `student`. When Spec #4 generalizes students to participants, `story_subjects.subject_id` follows whatever table wins; the polymorphic column means no migration here.
- Consent scopes: a text[] with a checked vocabulary, extendable by migration, not per-tenant branches.
- Metric grounding reads `metric_definitions` / `metric_snapshots`, which every tenant already has.
- Nothing in this spec knows AA's UUID. New tables carry no `org_id` default, and this spec removes one existing offender.

## 7. UX and UI

House language throughout: cream `#F5EFE2` surfaces, espresso chrome, taupe hairlines, the locked type scale and chip system, warm-RAG status (dot + label + weight, readable in grayscale), verdict first, management by exception, restraint in motion.

### 7.1 IA

Top-level **Comms** section in the sidebar (not nested under Fundraising: program staff capture stories and should never walk through the donor pipeline to do it). Three items: **Stories**, **Editions**, **Settings** (formats live here). The composer is not a nav item; it opens from a story.

### 7.2 Story bank

- **The list is the product.** A single calm column of story cards on cream, generous margin. Each card: title (heading weight), first line of body (ink-2), a subject chip, a consent chip, tag chips, a small photo thumb when present. Healthy recedes; problems advance: a card with expiring consent carries the ochre chip, expired/revoked carries the sparing brick chip and a muted "blocked from use" label. In grayscale the chips still read via label text and outline weight.
- **Verdict line at the top**, deterministic: "12 stories ready. 3 need consent before you can use them. Your best unused story is 6 weeks old." One sentence, worst true thing, then the list.
- **Rank by drag.** Cards drag vertically; drop writes `rank_order`. Unranked cards sit below a taupe hairline labeled "suggested", ordered by the computed score, each with a quiet "why" hover (fresh, unused, on-goal). Dragging one above the line adopts it into the ranked set. No confetti, a quiet saved tick.
- **Capture: 15 seconds, phone-first.** A single persistent "+ Capture a win" button (orange, rounded-full, house style) opens a bottom-sheet modal: title field autofocused, one textarea ("What happened, and what changed because of it? Rough is fine."), an add-photo tap target, an optional "Who's it about?" typeahead (only shown to users with `comms.subjects.read`; others get a plain text label field), save. Everything else (tags, goal link, consent) is deferred to the detail view. The modal never blocks on completeness; a raw story beats no story.
- **Story detail** is one altitude down: full body editable, subjects panel, consent panel (add consent: scopes as toggle chips, dates, upload the release into `documents`), media strip, tag editor, goal link, and the composer launcher ("Turn this into…"). Status advances raw → drafted → approved with a single control; approval is the human gate before anything is publishable.

### 7.3 Consent panel

- Per subject: a row with the person's label, consent state chip (current: muted sage, low emphasis; pending: ochre with "asked {date}, waiting"; expiring: ochre with "renew by {date}"; expired/revoked/none: brick, and the story card inherits the worst subject state).
- A "request consent" action stamps `requested_at` and opens a prefilled draft to the guardian containing the actual story text and photo, per the taught workflow. Sending it is manual (the org's own email); the panel just makes the ask a 30-second act.
- Adding consent is a small form, not a wizard: scope chips, granted by, granted on, expires on (defaults to +1 year with a gentle nudge that sunsets are best practice), optional evidence upload.
- Revoke is one action with a confirm; it takes effect instantly everywhere, including editions in flight (see failure modes).

### 7.4 Editions

- **Editions list**: cards per edition with format name, target date, status chip on the progress scale, and a completeness meter ("3 of 5 slots filled") as text, not a gauge. A "plan the year" action creates the full cadence of editions up front with target dates (the SafeSpace pattern: August, November, late February, mid-May, chosen around the fundraising calendar), so the deadlines exist months out and nothing gets written last-minute. Upcoming editions are candidates for the weekly rhythm surfaces later.
- **Edition builder**: the format's slots render as a vertical sequence of panels in order, each a drop target. Story slots open a picker that reads `v_publishable_stories` only, showing the ranked bank; blocked stories simply don't appear (the bank is where you fix them, with the verdict line pointing there). Metrics slots open a picker over `metric_definitions` with the latest snapshot value and its staleness shown per the trust-and-staleness rule ("updated 47 days ago" in ochre). Freeform and ask slots are plain textareas with the format's hint as placeholder.
- Each filled story slot shows an editable text area seeded from the story (or from a composer draft), so the edition holds final copy, and the story stays the reusable source.
- **Compile** is a single action available when required slots are filled: it previews the stitched plain text, then creates the `email_campaigns` draft and deep-links to the existing comms send page. The edition view then tracks the campaign's status.

### 7.4a Format editor (Settings)

- Lives under Comms Settings. A format renders as its slot sequence, the same visual as the edition builder but in edit mode: rename inline, drag to reorder, toggle required, change kind from a small select, add a slot from a "+ slot" affordance at any position, remove with confirm.
- Edits apply to future editions only; slot definitions are copied onto the edition at create time, so an in-flight edition keeps the structure it was started with and nothing breaks retroactively.
- Slot `key` is generated and stable once created; only label, hint, order, kind, and required are editable, so historical editions keep coherent references.
- Restraint applies: this is a settings surface, one altitude down, plain and quiet. No preview theater; the edition builder is the preview.

### 7.5 Composer

- Opens from a story as a right-hand sheet: channel selector (LinkedIn post, thank-you paragraph, grant anecdote, newsletter section, board update), an optional "ground it in numbers" metric picker, and a Draft button (Grow tier; base tier gets a structured blank editor with the story text prefilled).
- Output arrives as an editable draft with a one-line provenance note ("grounded in this story plus 2 metrics; names redacted"). Actions: edit, regenerate, approve, copy to clipboard, discard. Approve writes `comms_outputs` status; copy stamps nothing (used is stamped when it lands in an edition or the user marks it used).
- Never more than one AI draft on screen; regeneration replaces. Restraint over abundance.

### 7.6 Empty states

Day one, the bank shows a single warm panel: "Wins evaporate. Capture one now, rough is fine." with the capture button. Editions empty state offers the three seeded formats as cards. No tutorial overlays.

## 8. Staged build order

One PR per phase, one migration per phase, stop for Remi review at each named commit. Remi applies every migration by hand in the Supabase dashboard. Claude Code runs with stop-on-conflict and do-not-merge.

- **Phase 0 — recon.** Run section 13's prompt. Read-and-report only. No commit.
- **Phase 1 — `comms-1-story-schema`.** Migration 1: `stories`, `story_subjects`, `story_consents`, `story_media`, RLS, the two permission keys seeded into `role_permissions`, drop the `org_id` default on `bv_newsletter_subscribers`. API routes for story CRUD. No UI yet beyond a hidden route scaffold.
- **Phase 2 — `comms-2-story-bank-ui`.** Capture modal, bank list with verdict line, drag rank (writes `rank_order`), story detail with consent panel and media upload (EXIF strip in the upload route). `v_story_suggestions` and `v_publishable_stories` land here (migration 2, views only).
- **Phase 3 — `comms-3-composer`.** `comms_outputs` (migration 3), `redactStoryForModel`, composer sheet, channel prompts, tier gate on the Draft action, provenance note, copy/export.
- **Phase 4 — `comms-4-editions`.** `comms_formats`, `comms_editions`, `comms_edition_slots` (migration 4), format seeding on module enable, the format editor in Comms Settings, editions list with plan-the-year, edition builder (slots copied from format at create) with publishable-only pickers and metric staleness display.
- **Phase 5 — `comms-5-send`.** Compile to `email_campaigns`, status sync back to the edition, story status flip to `used` on send. No sender changes.
- **Phase 6 — `comms-6-loop`.** Usage signals into the suggestion score, "stories in this edition performed" panel on the sent edition (sends/opens available today; opens only if the sender records them, otherwise sends and gift attribution via campaign), bank verdict line learns "your last edition's lead story style".

Phases 1 and 2 are independently shippable and useful with zero AI. Phase 3 is where Grow tier value lands. 4 and 5 complete the newsletter promise. 6 is the compounding part.

## 9. Definition of done (observable)

- A staff user at a second tenant (Young Life EPA demo org) captures a story from a phone in under 20 seconds, and the row lands with that tenant's `org_id` with no code branch.
- A story linked to a minor participant with no photo consent cannot be selected in any edition slot or composer flow; it appears in the bank with a brick "blocked" chip, and the API returns 403 on direct attempts.
- Revoking a consent immediately removes the story from `v_publishable_stories` (verified by query) and surfaces a warning on any in-flight edition slot holding it.
- A composer draft's `model_grounding` shows redacted placeholders and no participant name for a minor-subject story, verified by inspecting the stored grounding and the request log.
- A quarterly edition built from the seeded format compiles into an `email_campaigns` draft that test-sends through the existing path, honoring `email_suppressions`.
- A second tenant renames "Program spotlight" to its own vocabulary, adds a slot, and reorders the format entirely through the Settings editor, with zero code changes; an edition already in `drafting` is unaffected by the edit, and the next edition created reflects it.
- `select column_default from information_schema.columns where table_name='bv_newsletter_subscribers' and column_name='org_id'` returns null, and the pg_attrdef cross-check agrees.
- All four new views/tables sets pass the RLS probe: a session without `comms.manage` reads zero rows; a staff session without `comms.subjects.read` reads stories but zero participant subject rows.
- Every new view shows `security_invoker=on` in `pg_views` reloptions.
- Board viewer role sees no Comms nav item and gets 403 on comms routes.

## 10. Failure modes

- **Consent expires mid-edition.** An edition in `review` holds a story whose consent lapses before send. Mitigation: compile re-validates against `v_publishable_stories` and hard-blocks with a named reason; the edition builder shows the ochre chip the moment state changes (computed, not cached).
- **Revocation after send.** A guardian revokes after the newsletter went out. We can't unsend. Mitigation: the story flips to retired with a revoked marker, is excluded from all future use, and the edition's archive view shows the revocation note; the audit log records who revoked and when. This is also the honest answer for the trust center.
- **Identifying data leaks to the model via free text.** A staffer types the kid's full name inside the story body, redaction replaces subject labels but not arbitrary prose. Mitigation: `redactStoryForModel` also runs the subject's known names (from the linked participant record, server-side) as literal replacements against the body before send; the residual risk (nicknames) is documented, and minor-subject stories display a standing "names in the text go to the AI, keep them out" hint in the capture and edit UIs.
- **The org_id trap, again.** A future migration copies a table definition with a default. Mitigation: definition of done includes the pg_attrdef probe; the Phase 0 prompt re-checks the full default list so drift is visible.
- **Rank fights.** Two users drag simultaneously; last write wins and someone's order jumps. Acceptable at this team size; `rank_order` writes are single-row updates, no reindex storms. Documented, not engineered around.
- **Suggestion score becomes the editor.** If the computed rank is too confident, users stop curating and the bank becomes a feed. Mitigation: manual rank always sorts above suggestions, and the suggested section is visually subordinate (below the hairline).
- **Second sender temptation.** Phase 5 pressure to "just add HTML" inside compile. Hard rule: the sender is untouched; HTML is a separate future spec with its own recon.
- **Storage growth.** Photos accumulate. Per-org path prefix plus `size_bytes` recorded now; quota display is a later ops concern, not a blocker.

## 11. Open decisions (with recommendations, all previously accepted by Remi)

1. **Participant-identifying data in the bank: yes**, gated behind `comms.subjects.read`, the first split off the staff bundle. Decided.
2. **Social publishing: export only** in v1. Decided.
3. **HTML rendering: deferred**, compile stays plain text through the existing sender. Decided.
4. **IA: top-level Comms.** Decided.
5. Remaining, low-stakes, decide at Phase 4: whether format seeding happens automatically for every org or on first visit to Comms. Recommendation: on first visit, so tenants who never use comms carry zero rows.
6. Remaining, decide at Phase 6: whether open tracking is worth adding to the sender (it currently records sends and failures, not opens). Recommendation: skip pixels in v1; measure with sends plus gift attribution through `campaigns`, which is the number that matters anyway.

## 12. Draft SQL migration appendix (reviewable, Remi applies by hand)

### Migration 1 (Phase 1): core story tables, permissions, trap fix

**Applied.** The reviewable SQL is now the real file —
`supabase/migrations/comms_phase1_story_schema.sql` — rather than a sketch, because the draft below
would not have survived CI. It creates `stories`, `story_subjects`, `story_consents`, and
`story_media`, seeds the two permission keys, and drops the `org_id` default on
`bv_newsletter_subscribers`. Read that file; the deviations from this appendix's original draft,
each from the Phase 0 recon, are:

- **Idempotency.** Every `create table` / `create index` uses `if not exists`, and every policy is
  `drop policy if exists` then `create policy`. `tests/migrations.test.ts` fails the build
  otherwise, and the whole point of the convention is that re-applying the folder is always safe.
- **The right `has_permission`.** Policies call `(select private.has_permission(org_id, …))`, the
  form every other policy in this database uses — the `select` wrapper is what lets Postgres cache
  it as an InitPlan instead of re-evaluating per row. `public.has_permission` is the app layer's
  RPC shim (Reed's), not a policy primitive.
- **`comms.subjects.read`**, not `.view` (see §6.3).
- **`strategic_goal_id … on delete set null`.** The annual OGSM reseed deletes every `plan_goals`
  row for an org; a restricting FK would block it. The link is a suggestion-score bonus, so losing
  it on a reseed is correct. The FK cannot express "same org," so the API proves that separately
  before writing.
- **A `private.story_subject_is_participant()` helper**, SECURITY DEFINER, because the consent
  policy has to ask about its parent subject's type. Asking with a plain `exists()` would invert
  into a leak: `story_subjects` has its own RLS, so for a caller without `comms.subjects.read` the
  participant row is invisible, the `exists()` returns false, and the policy concludes "not a
  participant" — granting exactly the access it was written to deny.
- **A scope vocabulary constraint** on `story_consents.scope`, so an unknown scope string cannot be
  stored and later read as permission.
- **`storage_path` is `{org_id}/{story_id}/{filename}`** in a `comms-media` bucket, not
  `comms/{org_id}/…`. Every bucket here puts the org id first because storage RLS keys off
  `(storage.foldername(name))[1]::uuid`; a literal first segment makes that policy form impossible.
  The bucket is created in the dashboard, not the migration — `storage.buckets` does not exist on
  the scratch Postgres the RLS harness runs against.

Registered in `scripts/test-rls.sh`'s ordered list, with cross-role assertions in
`supabase/tests/rls-leak-test.sql`.

### Migration 2 (Phase 2): views

```sql
create or replace view public.v_publishable_stories
  with (security_invoker = on) as
select s.*
from public.stories s
where s.status in ('approved','used')
  and not exists (
    select 1
    from public.story_subjects sub
    where sub.story_id = s.id
      and sub.subject_type <> 'none'
      and not exists (
        select 1 from public.story_consents c
        where c.story_subject_id = sub.id
          and c.granted_at is not null          -- pending requests don't count
          and c.revoked_at is null
          and (c.expires_at is null or c.expires_at >= current_date)
      )
  );

create or replace view public.v_story_suggestions
  with (security_invoker = on) as
select s.id, s.org_id,
  ( greatest(0, 90 - coalesce(current_date - s.happened_on, 90)) / 90.0 ) * 40  -- freshness, 40 pts
  + case when s.status <> 'used' then 25 else 0 end                              -- unused, 25 pts
  + case when s.strategic_goal_id is not null then 15 else 0 end                 -- on-goal, 15 pts
  + case when exists (select 1 from public.v_publishable_stories p
                      where p.id = s.id) then 10 else 0 end                      -- ready now, 10 pts
  + case when exists (select 1 from public.story_media m
                      where m.story_id = s.id) then 10 else 0 end                -- has media, 10 pts
  as suggestion_score
from public.stories s
where s.status <> 'retired';
```

### Migration 3 (Phase 3): comms_outputs

```sql
create table public.comms_outputs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  story_id uuid not null references public.stories(id) on delete cascade,
  edition_id uuid,                            -- FK added in migration 4
  channel text not null check (channel in
    ('linkedin','newsletter_section','thank_you','grant_anecdote','board_update',
     'news_flash','personal_forward')),
  body text not null,
  status text not null default 'draft'
    check (status in ('draft','approved','used','discarded')),
  used_at timestamptz,
  model_grounding jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RLS: stories pattern.
```

### Migration 4 (Phase 4): formats and editions

```sql
create table public.comms_formats (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  cadence text not null default 'quarterly'
    check (cadence in ('monthly','quarterly','annual','adhoc')),
  slots jsonb not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comms_editions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  format_id uuid not null references public.comms_formats(id),
  title text not null,
  status text not null default 'planning'
    check (status in ('planning','drafting','review','compiled','sent','archived')),
  target_date date,
  email_campaign_id uuid references public.email_campaigns(id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comms_edition_slots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  edition_id uuid not null references public.comms_editions(id) on delete cascade,
  slot_key text not null,
  slot_def jsonb not null,
  story_id uuid references public.stories(id),
  metric_ids uuid[],
  content text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, slot_key)
);

alter table public.comms_outputs
  add constraint comms_outputs_edition_fk
  foreign key (edition_id) references public.comms_editions(id) on delete set null;
-- RLS: stories pattern on all three.
```

## 13. Paste-ready Phase 0 recon prompt (for Claude Code)

```
Phase 0 recon for the Comms module (specs/comms-module.md). READ AND REPORT ONLY.
Do not write code, do not create branches, do not run migrations, do not merge
anything. stop-on-conflict applies: if anything below contradicts the spec,
stop and report rather than adapting.

Report on:

1. role_permissions: exact column names and shape, how permissions are seeded
   today, and whether inserting ('staff','comms.manage') style rows matches the
   real schema. Quote the create-table or a sample row.
2. has_permission: confirm public.has_permission(p_org uuid, p_perm text)
   delegates to private.has_permission and how session org context is resolved
   (getOrgContext or equivalent). Flag the known nondeterministic-membership
   issue if it would affect comms routes.
3. Supabase storage: which buckets exist, how documents rows map to storage
   paths, whether any upload route already strips EXIF, and the pattern used
   for per-org path prefixes.
4. The send path: file locations of the campaign create/test/send API routes,
   where suppression is enforced, and the exact status values email_campaigns
   uses in code (draft/sent/etc), so edition compile matches reality.
5. metric_definitions and metric_snapshots access patterns: the existing
   helper (if any) that resolves latest snapshot per metric, so the edition
   metrics slot reuses it.
6. ops_tasks linked_entity_type: the current accepted values list in code, so
   'story' and 'edition' can be added consistently if we wire tasks later.
7. plan_goals: confirm id shape and that a nullable FK from stories is safe.
8. The sidebar: where the nav config lives and how a new top-level section is
   added, including any role gating pattern for nav items.
9. Re-run the org_id default audit (pg_attrdef join) and report the current
   full list of tables with hardcoded defaults, so the spec's trap-fix scope
   is accurate on build day.
10. audit_log: how meaningful changes get recorded today, so consent grant and
    revoke events follow the same pattern.

Output a numbered report with file paths and quoted snippets. End with a list
of any spec assumptions the code contradicts. Then stop.
```

## 14. Amendments from the SafeSpace coaching session (2026-08-19)

The session validated the core design hard: Susan and Aris independently arrived at needing a fixed format, a win-gathering mechanism, per-story parent permission on top of blanket releases, and ranked story selection ("you could rank them and be like, okay, I think we should tell this story"). Remi taught the exact story-bank behavior this spec builds ("we're going to build this into Bloom in the comms section where you're going to be able to easily just put down a win"). Changes folded into the sections above:

1. Quarterly format seed replaced with the taught seven-slot structure, carried with generic labels (letter, person spotlight, program spotlight, the work, numbers, what's coming, support). Slot kind `letter` added. Per Remi's correction: the SafeSpace version of this format is a per-org customization, not the seed. Formats are fully editable through a Settings editor (add/remove/rename/reorder slots), edits apply to future editions only, and slot definitions are snapshotted onto editions at create.
2. **News flash** added as a fourth seeded format and a composer channel: the between-newsletters send that should feel like a text. Quarterly newsletter plus monthly-ish news flash is the taught cadence.
3. `personal_forward` composer channel added: the short personal note a leader or board member wraps around a forwarded newsletter for their top donors. The thin edge of board activation.
4. `stories.outcome` field and an outcome-oriented capture hint: the outputs-vs-outcomes teaching made structural. Storytelling centers on what changed, not what happened.
5. Consent gains `requested_at` and a `pending` state, plus a request action that drafts the guardian note with the actual story text and photo. Blanket intake releases are recordable, but the per-story confirm is the nudged standard, and the publishable view counts only granted consent.
6. "Plan the year" on editions: create the full cadence with target dates up front, scheduled around the fundraising calendar (the SafeSpace picks: August, November, late February, mid-May).

Horizon items surfaced by the session, deliberately not in scope:

- **Model-teaching coverage.** Comms teaches the model one piece at a time and never reuses the frame. A future version tags stories and editions with model themes and shows which parts of the model donors have been taught and which are overdue. Powerful, but it needs real usage data first.
- **Board activation.** Training board members to cultivate before asking, with per-member forward lists and cadence nudges. Its own module someday; `personal_forward` is the seed.
- **HTML edition export.** The SafeSpace engagement is producing a designed MailChimp template by hand. That template becomes the reference input for the future HTML rendering spec. Export-for-external-ESP (not a second sender) is the likely first step; v1 stays plain text.
- **Rhythm hook.** Win capture belongs in the weekly cadence ("part of your weekly cadence with Jasmine"). When the rhythm module's Friday Close ships, it should ask "any wins this week?" and deep-link the capture modal.
