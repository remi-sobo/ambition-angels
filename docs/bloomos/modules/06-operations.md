# Module 06 — Operations

**Sidebar:** Team · Meetings · Projects · Documents
**Job:** how the work gets done. An opinionated, zero-config Asana replacement with the weekly ritual built in; HR-lite on top of Gusto; the meeting scheduler that already exists; and the document system of record.

## Projects (the Asana replacement — keep it small on purpose)

Research verdict: for 2–10-person teams the failure mode is **abandonment from configuration burden**, not missing features. Primitive set (binding):
- **Task**: title, single assignee, due date, status (todo/doing/done), project?, notes, comments, recurrence rule. **No** custom fields, multi-assignees, dependencies, Gantt, portfolios in v1 — these are the documented churn drivers.
- **Project**: name, owner, status, target date, description, task list with sections; activity log (exists).
- **My Week**: the personal home — Today / This Week / Later buckets (exists as Today/ThisWeek views; polish), overdue float-up.
- **Triage** (borrowed from Linear): an inbox for unassigned/inbound items (briefing suggestions, agent proposals, meeting action items) requiring explicit accept/decline — keeps the execution surface clean.
- **The ritual is the product** (exists — productize): **Monday Plan** (pick Big-3 priorities, AI suggests from briefing + carryover + deadlines) and **Friday Review** (wins captured → feeds Recent Wins + briefing; carryover triage; week-close summary). No incumbent ships this loop natively.
- Quick-add everywhere (⌘K, mobile PWA), comments with @mentions → notifications.

## Meetings

The existing `/meet` scheduler (meeting types, availability, Google Calendar, reminders, ICS) moves here intact. Additions, in order:
1. **Meeting notes → tasks**: paste/upload notes or transcript → AI extracts {action, owner, due} triples → confirm step → tasks created with backlink (the consensus draft-then-confirm pattern).
2. Internal meeting records (agenda template, decisions log) — lightweight; board meetings live in Governance.
3. Meeting analytics for Team Pulse (completion rate on the mockup).

## Team (HR-lite — a layer on Gusto, never a payroll system)

Research verdict: read from Gusto's App Integrations API (employees, contractors, time-off, payroll totals — scopes granted at partner review; **start Gusto production pre-approval early**, it gates everything); don't rebuild what Gusto Simple includes; own what Gusto never will:
1. **Team records**: staff/contractor profiles (Gusto-synced where connected), role, start date, emergency contact; **volunteers and board members included** (Gusto's blind spot).
2. **Onboarding checklists**: templated task lists per hire type (the I-9-within-3-days / W-4 / handbook sequence as defaults); I-9 retention-date auto-calc (hire+3y vs term+1y, whichever later) if stored — else "completed in Gusto" checkbox.
3. **Time-off visibility**: synced from Gusto (no parallel ledger — two sources of truth is the classic failure); team out-today on the dashboard.
4. **Lightweight check-ins**: recurring 1:1/quarterly record — wins, blockers, goals, support needed; date-of-last-check-in indicator. **That's the whole performance feature** (360s/OKR cascades are documented overkill <25 staff).
5. **Clearance tracking** (shared with Program §safeguarding): background checks, trainings, expiries — blocks student-facing assignment.
6. Volunteer hours roll-up (valued at Independent Sector rate) for impact/board reporting.
7. Classification helper content (employee/contractor/volunteer rules incl. the 20% stipend rule) marked "law in flux — not legal advice," linking out.

## Documents

1. Org file system on Supabase Storage (`{org_id}/...`, private, RLS): folders by domain (Board, Finance, HR, Programs, Grants, Compliance); per-folder role access (board_viewer sees Board; finance sees Finance).
2. **Doc classes drive retention** (04 §3): permanent (articles, bylaws, 990s, minutes, determination letter) / 7-year (financial) / program / safeguarding — with retention-policy surfacing.
3. Entity attachments: every grant, agreement, board meeting, contract links its documents (one storage layer, many surfaces).
4. E-sign: clickwrap flow (consents, acknowledgments) + SignWell escalation (offer letters, resolutions) — 03 §decision.
5. v2: pgvector search over document text ("ask BloomOS where the W-9 for vendor X is"); SOP/playbook pages (lightweight Trainual replacement — research shows the sub-$150/mo tier is underserved).

## KPIs
Task completion rate, Big-3 hit rate, % weeks with Monday Plan + Friday Review completed, overdue compliance/clearance counts, onboarding checklist completion time.

## Open questions
- Gusto connection value vs effort for AA right now (2 people) — likely Ring 3; checklists/check-ins don't depend on it.
- Meeting transcription source (Google Meet transcripts? manual paste?) for notes→tasks v1 — recommend manual paste first, zero new vendors.
