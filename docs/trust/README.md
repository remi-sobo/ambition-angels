# Trust & Security Documentation

**Status: DRAFT — internal working documents.** Nothing in this folder is
published or contractually binding until reviewed (counsel review is the
Ring 4 exit gate per `docs/bloomos/07-roadmap.md`). The public `/trust`
page ships later from `trust-page-draft.md`.

| Document | Purpose |
|---|---|
| `subprocessors.md` | Who processes our data, what they get, and why |
| `incident-response.md` | The IR runbook, keyed to the 72-hour district clock |
| `data-retention.md` | Retention classes and deletion workflow |
| `trust-page-draft.md` | Copy draft for the future public trust page |

## Open items (not draftable in-repo)

- [ ] Sign the Supabase DPA (dashboard → Legal Documents) and Vercel DPA.
- [ ] Anthropic zero-data-retention agreement before any student PII flows
      through prompts (see 04-security-compliance.md §5).
- [ ] Remaining short policies when productization nears: InfoSec program
      (COPPA-2025 WISP), access control, vendor management, acceptable use.
- [ ] Counsel review of all of the above before any external sale.
