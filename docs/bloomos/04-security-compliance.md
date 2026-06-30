# 04 — Security & Compliance

BloomOS holds donor financial data and **minors' PII**. Security is a product feature (districts and funders ask), not just hygiene. This doc sets the binding posture; legal interpretations need counsel sign-off before we sell to school-partnered orgs (Ring 4).

## 1. Security model (summary of bindings from 03)

- RLS on every tenant table + storage path; user-JWT clients by default; admin client only in named server paths with org scoping + leak tests.
- MFA (TOTP) required for owner/admin; magic links for board viewers; session refresh in middleware only — authorization checks live in server actions/handlers + RLS.
- Secrets: provider tokens AES-256-GCM app-layer encrypted (Supabase pgsodium/TCE is deprecated — do not use; Vault only for platform secrets). Platform defaults already give AES-256 at rest + TLS 1.2+ everywhere.
- Backups: Supabase daily (7d) + nightly off-platform pg_dump + quarterly restore test. PITR when revenue exists.

## 2. Audit logging

```sql
create table audit_log (
  id bigint generated always as identity,
  ts timestamptz not null default now(),
  org_id uuid not null,
  actor_user_id uuid,
  action text not null,           -- 'update' | 'delete' | 'export' | 'view_sensitive' | ...
  entity_type text not null,
  entity_id uuid,
  before jsonb, after jsonb,
  ip inet, user_agent text, request_id text,
  primary key (id, ts)
) partition by range (ts);        -- monthly partitions; retention = drop partition (pg_cron)
revoke update, delete, truncate on audit_log from authenticated, anon;
```

- **Application-level** logging (captures HTTP context AND sensitive *reads* — "who viewed this student's record" — which triggers can't see). Plus vendored supa_audit-style triggers (the repo is archived — copy the SQL) on the 3–5 most sensitive tables (participants, guardians, case notes) as a safety net.
- RLS: org admins read their own org's log; nobody updates/deletes. True immutability (vs. the postgres role) comes from the nightly off-platform export.
- 12 months hot, archived partitions to object storage if a contract requires longer.
- The audit log doubles as the **FERPA §99.32 disclosure ledger** districts can request.

## 3. Minors'-data compliance (the youth-serving differentiator)

**Legal map (researched June 2026; counsel to confirm at Ring 4):**

| Law | Applies to us? | What it drives |
|---|---|---|
| **FERPA** | Not directly — but binds us derivatively the moment a district shares education records (school-official exception requires "direct control" via a DSA; consent path requires signed/dated/specific parental consent; studies exception requires destruction clauses) | Consent records module; disclosure ledger; purpose tagging per data element; no redisclosure by design; destruction automation + certificates |
| **PPRA** | If surveys administered through schools touch 8 protected areas | Protected-topics screen + consent/opt-out gating per survey before assignment |
| **COPPA** | Under-13 online collection only (HS-age platform largely out of scope); true nonprofits exempt as operators — but the 2025 amended rule (full compliance Apr 22, 2026) is the de facto bar buyers apply | Neutral age gate; block/VPC under-13; **written retention policy published in the privacy notice**; written infosec program |
| **State student-privacy (SOPIPA pattern, ~40 states; NY Ed Law 2-d + Part 121; CA Ed Code 49073.1)** | Yes when serving school-sourced data | No ads/ad-SDKs/profiling/sale — architecturally true; district deletion-on-request endpoint; NY: NIST-CSF-aligned Data Security & Privacy Plan + Parents' Bill of Rights signature; CA: LEA-ownership + retention-certification contract terms |
| **SDPC NDPA** (the de facto district DSA template, v2.x) | The contract we must be able to sign | 72-hour breach notice to LEA; disposition within 60 days of termination + certification; subprocessor flow-down + public list; Exhibit B data-elements enumeration |
| **State breach laws** | All 50 states | IR runbook keyed to shortest applicable clock (72h contractual); encryption safe harbor |

**Product checklist (build-into-schema items):**
1. **ConsentRecord** per participant per consent type (enrollment, liability, media, medical, field-trip, data-sharing, survey/research) with: signer role (guardian vs. eligible student vs. youth-assent dual-signature slots), records/purpose/recipient fields (FERPA §99.30 anatomy), e-sign audit trail (IP, timestamp, doc-version hash), `valid_from/valid_until` tied to program year, renewal campaigns at rollover, **age-18 transfer flag** (consent authority moves to the student).
2. **Per-district DSA registry**: authorized data elements (drives field-level gating), purpose, retention deadline, breach SLA, state supplement. Exhibit B auto-generated from the data dictionary.
3. **Deletion workflows**: soft-delete (`deleted_at`) + scheduled hard-purge; per-org and per-district deletion with **generated destruction certificate** (incl. subprocessor confirmations); anonymize rather than delete rows referenced by audit/financial records; retention classes — program PII short (exit + ~1yr default, configurable), **safeguarding/consent/incident records long** (age of majority + longest abuse SOL — states toll for decades), audit logs per contract.
4. **De-identified reporting**: aggregation with small-cell suppression in every funder-facing export.
5. **Data dictionary with purpose justification** per field; optional fields default OFF (data minimization is both the law's and PTAC's expectation).

## 4. Safeguarding features (Program module dependencies)

- **Clearance tracking** on every adult record (staff/volunteer/mentor): check type (state criminal, child-abuse registry, FBI fingerprint, TB where district-required), date, expiry (60-month PA-style default clock, configurable), training completions (mandated reporter, abuse prevention). **Role assignment to student-facing work blocks until clearances are current.** MOU renewals cross-check per-person clearance expiry (the documented failure mode that delays district renewals).
- **No private 1:1 adult↔minor digital contact** (Scouting America standard, Praesidium norm): if BloomOS ever carries messaging, threads with a minor must auto-include a second authorized adult/parent, be retained (no ephemeral), and be auditable. Until then: we store communication *logs*, not a messaging channel.
- **Incident reporting**: confidential intake, restricted access tier, long retention flag, state-hotline directory. Internal logging never substitutes for the legal report — say so in the UI.
- Mentor-program workflows follow MENTOR EEP benchmarks (screening, ≥2h pre-match training gate, 2x-first-month-then-monthly match-support cadence) — spec'd in modules/02.

## 5. AI guardrails for minors' data

- Draft-then-approve for anything client-facing; no autonomous decisions about individuals (NTEN/DoE/UNICEF alignment).
- Early-warning/disengagement flags are **transparent rule-based** (ABC-style thresholds), framed as "outreach prompts," never "risk labels"; flag-rate auditing by demographic group; school-sourced data stays out of flagging logic unless the DSA permits.
- Anthropic ZDR agreement before student PII flows through prompts; pseudonymize where quality allows; parent-facing privacy notice documents the AI posture.
- Survey thematic coding: AI proposes themes, staff approve, every theme traceable to quotes (LLMs are good at sentiment κ≈0.9, bad at "evidence of impact" judgments κ≈0 — humans own those).

## 6. Trust posture & SOC 2 path (sequenced, not bought early)

Research verdict: **do not buy SOC 2 now.** Small-nonprofit buyers clear on questionnaires + DPAs; districts escalate to SOC 2 only at district-wide scale. The hedge is cheap groundwork that also answers ~90% of questionnaires:

**Ring 1–2 (≈$0):**
- MFA/SSO on every operator account (GitHub, Vercel, Supabase, Google); least-privilege + access inventory; branch protection; Dependabot.
- **Public trust page**: security overview, subprocessor list (Vercel, Supabase, Anthropic, Resend, Givebutter, Intuit, Google…), uptime, data-handling summary.
- 5–8 short written policies: InfoSec program (doubles as the COPPA-2025 WISP), access control, incident response (with the 72h district clock), vendor management, retention/deletion, acceptable use.
- Pre-filled **CAIQ Lite** + readiness to complete CoSN K-12CVAT-style questionnaires; **ready-to-sign SDPC NDPA** with state exhibits.
- Inherit infrastructure attestations: Supabase SOC 2 Type 2 / Vercel SOC 2 Type 2 cited as subprocessor assurance; signed DPAs with both.

**Ring 4 trigger (district-scale or multi-org deal 3–6 months out):** budget-path SOC 2 — Comp AI/Sprinto-class platform + partner auditor ≈ **$8–15K year one**, Type I then a 3–6-month-window Type II; annual pentest (~$4–8K) when questionnaires demand; cyber insurance (~$1–3K/yr, $1M) when a contract requires. VPAT/accessibility statement when the first RFP asks (WCAG 2.1 AA is the design-system target regardless — 06).

## 7. Service-role write-on-behalf registry

The service-role client (`lib/supabase/admin.ts`) bypasses RLS, so a write it makes can land a row for **any** user in any tenant. Most service-role use is reads or system/ingest writes (HubSpot sync, donations, the AI ledger), where the row belongs to the org, not to another person. The dangerous subset is **writing a row owned by or targeted at another specific user** — the case RLS would normally forbid. That subset is deliberately confined to a small, named set, each justified, so it stays greppable:

| Module | Writes on behalf of | Why service-role (not the session client) |
|---|---|---|
| `lib/notifications/notify.ts` | The **recipient** of a notification | A user cannot insert a notification into another user's inbox under RLS; the actor triggers it, the recipient owns it. `notify()` is the **only** insert path into `notifications` (enforced by `tests/service-role-writes.test.ts`). `org_id` + `recipient_id` always come from session, never a column default. |
| `lib/messaging/threads.ts` | Other **thread members** (DM / group) | A sender writes the shared thread, the membership rows for the other participants, and the message; under RLS a sender cannot write a `thread_member` row for someone else. Confined to this one module after an app-level membership check; notifications still fan out through `notify()`. |

**Rule.** Before adding a new service-role write that acts on another user's behalf, add it to this table with its justification. The notifications invariant is enforced in CI; treat this table as the allowlist for the rest.
