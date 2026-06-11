# Public Trust Page — Copy Draft

> DRAFT copy for a future `/trust` page. Do not publish until the DPAs are
> signed, the subprocessor list is verified, and the claims below get a
> review pass. Voice per 06: plain-English, no enterprise-speak.

---

## How we protect your data

Ambition Angels runs on BloomOS, our operating system for nonprofit work.
Here's how we look after the information families, donors, and partners
trust us with.

**The short version**

- We collect only what we need to run our programs, and we tell you why.
- We never sell data. There are no ads and no ad trackers — anywhere.
- Student information is never used to train AI, and AI never makes
  decisions about a young person. People do.

**Security, concretely**

- Every record is protected by database-level access rules (row-level
  security) — checked by automated tests on every change we ship.
- Staff sign in with individual accounts; every sensitive action is
  written to an append-only audit log.
- Data is encrypted in transit and at rest, with nightly encrypted
  backups stored independently of our database provider.
- Our infrastructure providers (Vercel, Supabase, Stripe) maintain
  SOC 2 / PCI attestations; we publish the full subprocessor list below.

**Your choices**

- Ask us what we hold about you, or ask us to delete it:
  remi@ambitionangels.org. We respond within 30 days.
- Donation receipts and records are kept as the IRS requires; personal
  details beyond that are removed on request.

**Subprocessors** — [table from subprocessors.md, verified]

**Questions?** remi@ambitionangels.org

_Last updated: [date at publish]._
