# Subprocessor List (DRAFT)

> Internal draft — verify each vendor's current attestation and sign DPAs
> before publishing. "Assurance" cites the vendor's published posture; we
> do not re-certify it.

Every third party that stores or processes Ambition Angels data, what they
receive, and why. Architectural baseline: no advertising SDKs, no data
sale, no profiling — donor and program data never leave this list.

| Subprocessor | Purpose | Data categories | Region | Assurance |
|---|---|---|---|---|
| **Vercel** | Web hosting, serverless compute, cron | All application traffic in transit; logs (IP, user agent) | US | SOC 2 Type 2 (published); DPA available |
| **Supabase** | Postgres database, authentication, storage | All application data at rest: donors, donations, program registrations, quiz submissions, finance records, audit log; auth credentials (hashed) | US (project region) | SOC 2 Type 2, HIPAA option (published); DPA available |
| **Stripe** | Donation payments | Donor name, email, payment details (card data never touches our servers) | US | PCI-DSS Level 1, SOC reports (published) |
| **GiveButter** | Donation widget/campaigns | Donor name, email, gift details for campaign gifts | US | Published privacy program; PCI via processors |
| **Resend** | Transactional email | Recipient email addresses, email content (receipts, notifications, magic links) | US | SOC 2 Type 2 (published) |
| **Anthropic** | AI features (career quiz matching, funder research) | Quiz answers as submitted (name/email excluded from prompts where feasible); public funder research data. No student records. | US | SOC 2 Type 2 (published). ZDR agreement pending — required before any student PII enters prompts |
| **HubSpot** | CRM of record (read-only mirror into BloomOS) | Fundraising contacts, companies, deals, engagement history | US | SOC 2 (published) |
| **Google Workspace** | Calendar + Gmail for `/meet` scheduling | Meeting bookings: attendee name, email, meeting times | US | ISO 27001 / SOC 2 / SOC 3 (published) |
| **Zoom** | Video meeting links for `/meet` bookings | Meeting join links only (no recordings stored by us) | US | SOC 2 (published) |
| **GitHub** | Source code; encrypted nightly database backups (Actions artifacts) | Backup dumps encrypted with a passphrase held outside GitHub; 30-day retention | US | SOC reports (published) |

## Change process

Additions to this list require: purpose justification, data-category
review, DPA/terms check, and (once districts are customers) the NDPA
subprocessor flow-down + advance-notice obligation.

_Last reviewed: 2026-06-11 (initial draft)._
