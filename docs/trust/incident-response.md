# Incident Response Runbook (DRAFT)

> Internal draft — pending review. The clocks below become contractual the
> day a district DSA is signed; until then they are our operating standard.

## Scope & roles

Applies to any suspected unauthorized access, disclosure, loss, or
alteration of Ambition Angels data, and to availability incidents that
affect data integrity.

- **Incident Commander (IC):** Remi (remi@ambitionangels.org). Backup: Shannon.
- The IC owns the timeline, the log, and all external communication.
  Nobody else communicates externally about an incident.

## Severity

| Level | Definition | Examples |
|---|---|---|
| SEV-1 | Confirmed exposure of personal data, or credential compromise | Leaked service-role key; donor table scraped |
| SEV-2 | Suspected exposure, contained vulnerability, or auth bypass | RLS gap found in prod; admin session hijack suspected |
| SEV-3 | Security-relevant defect with no evidence of exposure | Dependency CVE; misconfiguration caught internally |

## Response steps

1. **Detect & log.** Open a private incident log (timestamped). Note who,
   what, when. Preserve evidence — don't delete logs or rotate them away.
2. **Contain.** In order of blast radius: rotate the affected secret
   (Vercel env vars, Supabase keys, GitHub secrets); revoke Supabase
   sessions; disable the affected route or take `/admin` offline if needed.
3. **Assess.** What data, whose, how many records, over what window? Use
   the `audit_log` table and Vercel/Supabase logs to bound the exposure.
   Record whether the data was encrypted (state-law safe harbor).
4. **Eradicate & recover.** Fix the root cause; restore from the nightly
   encrypted backup if integrity is in doubt; verify with the RLS leak
   test where applicable.
5. **Notify (see clocks below).**
6. **Post-mortem** within 7 days: timeline, root cause, what detection
   missed, follow-up items with owners.

## Notification clocks

Keyed to the **shortest applicable clock**:

| Audience | Clock | Trigger |
|---|---|---|
| School districts (LEAs) | **72 hours** (NDPA standard) | Any incident touching school-sourced student data, once such contracts exist |
| Affected individuals (donors, guardians, participants) | Without unreasonable delay; per the strictest applicable state breach law | Confirmed exposure of their personal data |
| State regulators | Per state breach statutes (varies; some 30–45 days, some "expedient") | Thresholds vary by state and record count |
| Insurers / counsel | Immediately on SEV-1 | Before individual notifications go out |

Internal logging never substitutes for a legally required report.

## After action

Every SEV-1/2 adds: a regression test where possible, a detection
improvement, and a line in the next board update.

_Last reviewed: 2026-06-11 (initial draft)._
