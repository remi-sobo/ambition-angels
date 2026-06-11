# Data Retention & Deletion Policy (DRAFT)

> Internal draft — pending review. Defaults below are configurable
> per-contract once district DSAs exist; financial and consent classes are
> non-negotiable floors.

## Retention classes

| Class | Examples | Retention | Rationale |
|---|---|---|---|
| Program participant PII | Quiz submissions with contact info, YGB/Demo Day registrations, attendance | Program exit + **1 year** (default; per-district DSA can shorten/extend) | Data minimization (FERPA/PTAC expectation) |
| Consent & safeguarding records | Consent records, incident reports, clearance records (future modules) | **Age of majority + longest applicable abuse SOL** — decades; flagged long-retention | States toll limitation periods; these protect the participant and the org |
| Financial records | Donations, transactions, budgets, pledges | **7 years** | IRS recordkeeping for 501(c)(3)s |
| Donor CRM data | Contact info, giving history | While the relationship is active + 7 years for gift records | Stewardship + IRS substantiation |
| Audit log | `audit_log` partitions | **12 months hot**; older partitions dropped (archived to object storage only if a contract requires) | FERPA §99.32 ledger; partition-drop retention by design |
| Website analytics | `page_views`, `click_events` | 24 months | Trend analysis only; no ad use |
| Database backups | Encrypted nightly dumps (GitHub artifacts) | **30 days** rolling | Disaster recovery |
| Operational data | Tasks, projects, meetings | Life of the org | Internal operations |

## Deletion workflow

- **Request path:** any individual (or guardian) can request deletion via
  remi@ambitionangels.org; honored within 30 days.
- **Mechanics (current):** hard delete of the requester's rows across
  tenant tables; rows referenced by financial or audit records are
  **anonymized instead of deleted** (the record of the transaction
  survives; the person does not).
- **Mechanics (Ring 3+ per spec):** soft-delete (`deleted_at`) + scheduled
  hard purge; per-district deletion-on-request endpoint; generated
  destruction certificate including subprocessor confirmations; NDPA
  60-day disposition after contract termination.
- Backups age out on the 30-day cycle; deleted data persists at most that
  long in encrypted form.

_Last reviewed: 2026-06-11 (initial draft)._
