# BloomOS — Product & Technical Specification

**The all-in-one operating system for small nonprofits.**
*Data, Finance, Fundraising, Programs, Impact — built so a nonprofit CEO can do more with less.*

- **First deployment:** Ambition Angels, at `/admin` (replacing and absorbing the current admin)
- **End state:** multi-tenant SaaS sold to other small nonprofits (1–10 staff, <$5M budget)
- **Branding:** "BloomOS™ — Operating System for {Org Name}". Footer: *All-in-one operating system for nonprofits. Data, Finance, Fundraising, Programs, Impact. Built by SOBO Consulting.*

This spec was produced from a deep-research pass (June 2026) across the donor-CRM, case-management, work-management, board-governance, finance-tooling, and impact-measurement markets; IRS/FERPA/COPPA/state-law compliance sources; and the QuickBooks, Gusto, Givebutter, and HubSpot API surfaces. Sources are cited throughout the documents.

---

## Document index

| Doc | Contents |
|---|---|
| [01-vision-and-strategy.md](./01-vision-and-strategy.md) | Why BloomOS, the market gap, positioning, pricing strategy, competitive landscape |
| [02-current-state.md](./02-current-state.md) | Audit of today's `/admin`, what we keep/evolve/replace, **Phase 0 urgent items** |
| [03-architecture.md](./03-architecture.md) | Stack decisions, multi-tenancy & RLS, auth & RBAC, background jobs, integrations, AI architecture, dashboards framework |
| [04-security-compliance.md](./04-security-compliance.md) | Security model, audit logging, minors'-data compliance (FERPA/COPPA/state law), safeguarding, trust posture & SOC 2 path |
| [05-data-model.md](./05-data-model.md) | Core schema across all modules |
| [06-design-system.md](./06-design-system.md) | Information architecture (sidebar), UX principles, design tokens, layout, the Command Center widget system |
| [modules/01-command-center.md](./modules/01-command-center.md) | Overview dashboard + AI Executive Briefing |
| [modules/02-program.md](./modules/02-program.md) | Students, Schools, Ambition App, Internships, Career Readiness |
| [modules/03-fundraising.md](./modules/03-fundraising.md) | Donors, Major Gifts, Grants, Campaigns, Events |
| [modules/04-finance.md](./modules/04-finance.md) | Revenue, Expenses, Cash Flow, Budget vs Actual (QuickBooks layer) |
| [modules/05-data-impact.md](./modules/05-data-impact.md) | Website/App/Student Analytics, Surveys & Impact measurement |
| [modules/06-operations.md](./modules/06-operations.md) | Team (HR-lite), Meetings, Projects (Asana-replacement), Documents |
| [modules/07-governance.md](./modules/07-governance.md) | Board, KPIs, Strategic Plan, Compliance calendar |
| [07-roadmap.md](./07-roadmap.md) | The build plan: Ring 0 → Ring 5, sequencing, and what "done" means per ring |

## How to use this spec

1. **Read 01 + 02 + 07 first** — strategy, where we are, and the build order.
2. Each module doc is self-contained: purpose → user stories → functional spec → data model pointers → AI features → open questions. Modules are sized so each can become a workstream/epic.
3. Architecture decisions (03) are binding unless overturned deliberately; each carries its rationale and the research behind it.
4. The roadmap is deliberately incremental: **every ring ships something Ambition Angels uses in production.** We are our own first customer; productization for other nonprofits is a later ring, but multi-tenant foundations are laid early because retrofitting them is the one thing that's brutally expensive to do late.

## One-paragraph thesis

Every affordable tool for small nonprofits does one slice — donors (Bloomerang/LGL), payments (Givebutter), tasks (Asana), books (QuickCooks/QuickBooks), boards (Boardable) — and **none** does programs, grants, impact, compliance, and governance together. The tools that do more (Salesforce, Bonterra) carry $10K–$100K/yr true costs and consultant dependencies that 1–10-staff orgs cannot absorb. BloomOS consolidates the whole back office on one data model, prices flat (not per-record, not per-seat), treats QuickBooks/Gusto/Givebutter as systems of record it reads from rather than replaces, and uses AI agents — grounded in the org's own data, always draft-then-approve — to give a small team the operating leverage of a large one.
