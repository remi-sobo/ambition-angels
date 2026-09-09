# Spec Inbox — the last destination: Inbox + Messages

The eighth and final cutover. Inbox is the utility below the divider, not one of the seven — two tabs, one of which has been live and kept-in-place since B2. What remains is the map's oldest standing contract: the two `notifications.url` shapes stored in production (`/admin/messages`, `/admin/messages?t=<uuid>`) have waited through six destination cutovers for their seat to exist. This spec builds it — a host, nothing more — and closes the map. After it, only Spec B's owed `NAV_SECTIONS` deletion remains of the whole V2 rebuild.
Date: 2026-09-09 · Depends on: `docs/v2-recon.md` (§F.1, §F.2, §G), `docs/v2-preservation-ledger.md` (R11 — `entity_comments` dormant with a reserved seat "in Inbox alongside Messages", SIGNED 2026-09-03), Spec B (the host pattern, final application), Specs Home through Organization (all merged; seven destinations live).

---

## Problem statement

Inbox is BloomOS's awareness layer: the per-user notification feed at `/admin/inbox` (alerts, mentions, one unread pointer per chat conversation) and the team chat at `/admin/messages` (threads linkable by `?t=<threadId>` — exactly the shape the Inbox pointers store). The V2 model puts both under one utility: Inbox · Messages, with Messages at `/admin/inbox/messages`. The feed has been its own seat all along (`KEPT_IN_PLACE` since B2); Messages is the shell's last unbuilt merge seat — `liveSeatFor("/admin/inbox/messages")` still resolves to `/admin/messages`, the only tab in the whole model that does. And the redirects suite has pinned, since Stage 0, that the two stored notification shapes "must stay live until the seat exists." The seat is two files away.

## Who's affected

Everyone sees Inbox (the feed has no feature gate — awareness is universal). `modules.messages` gates the Messages tab: AA and YGB render both tabs; the 9-key orgs render Inbox alone (the shell's existing pinned behavior). The Inbox pointers' whole point is that a click lands in the right thread — the `?t=` param is the contract this spec must not drop.

## Current behavior

`/admin/inbox` renders the notification feed (RLS-scoped per user; its tiny `LINK_MAP` builds V1-shaped links that ride the standing 308s). `/admin/messages` renders the chat — its own dark chrome (`bg-ink` shell), `modules.messages` gate in its own layout, `?t=` selecting the open conversation. The at-cutover row `/admin/messages → /admin/inbox/messages` (exact, merged) is correctly targeted already — unlike Organization's children, no re-aim is needed; the seat simply doesn't exist. The Inbox tab slot renders the V1 fallback (the last destination that does). `entity_comments` is dormant with R11's signed reserved seat alongside Messages.

## Desired behavior

`/admin/inbox/messages` hosts the chat unmodified — dark chrome, gate, `?t=` and all — and `/admin/messages` 308s to it with the thread param surviving. `"inbox"` joins `V2_CUTOVER_DESTINATIONS`; every tab slot in the app now renders the V2 row. The stored-shapes test flips from "stays live until the seat exists" to "resolves to the seat" — the contract discharged, not deleted.

## Scope

**In.**
- The Messages host: `app/admin/inbox/messages/page.tsx` (pure re-export — `searchParams` flow through, so `?t=` works untouched) + its gate layout mirroring the V1 `modules.messages` fence.
- The Inbox cutover: the row activates in map + config, `"inbox"` joins the cutover set, the stored-shapes test discharges its contract, four-org printout + crawl (the `?t=` 308 is the crawl's headline assertion).

**Out.**
- Any Messages or Inbox feed rework — the chat keeps its dark chrome and polling; the feed keeps its `LINK_MAP` (its V1-shaped links 308 correctly; rewriting them is cleanup, not cutover).
- The Reed approvals slice the recon binds to Inbox — `/admin/reed` (at-cutover, "becomes the contextual panel") owns approvals today; the Inbox binding waits for the panel work (decision 2).
- The "graduates into Today" rule — new logic; Contract 3's arms stay frozen, as they have through five specs.
- `entity_comments` — R11's reserved seat stays reserved and empty (decision 3), the journeys shape.
- The Phase-3 notifications emitter, message reactions rework, anything schema: **no migrations.**
- **The `NAV_SECTIONS` deletion** — Spec B's debt, and the very last PR of the rebuild. It deserves its own diff with its own crawl, immediately after this spec completes; it is named here so it cannot be forgotten, and excluded so this cutover stays one move.

## Architecture

### The screens and their sources (recon §G — both live)

| Screen | Source | Status |
|---|---|---|
| Inbox | `notifications` (per-user RLS; one unread pointer per conversation via `postMessage`) | live, kept-in-place since B2 |
| Messages | `message_threads`/`messages`/`message_thread_members`/`message_reactions` via `lib/messaging/threads` | live at V1 path — the host is the build |

### The cutover (ninth and final use of Spec B's machinery)

One row activates: `/admin/messages` → `/admin/inbox/messages` (exact — already correctly targeted; the query rides the 308 as it has on every exact row since F6). `"inbox"` joins `V2_CUTOVER_DESTINATIONS`, and with it the V1 SectionSubNav fallback in the tab slot is dead code app-wide — which is precisely what makes the `NAV_SECTIONS` deletion safe next. The redirects suite's stored-shapes test — the one that has asserted `v2Href("/admin/messages?t=<uuid>")` stays put through every cutover — flips to assert the translation, closing the loop the recon's §F.2 opened.

## Staged build order

**X1 — the Messages host.** Two files (re-export page + gate layout); the row is untouched (correctly targeted since Stage 0); `liveSeatFor` starts resolving the seat to itself the moment the row activates — which is X2, so X1 is dark: reachable, unlinked, byte-identical everywhere else. Commit: `spec-inbox: messages-host`.

**X2 — cutover.** The row activates in map + config, `"inbox"` joins the set, the stored-shapes contract discharges, verification: four-org printout (AA/YGB two tabs, 9-key orgs Inbox alone), live crawl (`/admin/messages?t=<uuid>` 308s with the param; the feed untouched). Commit: `spec-inbox: cutover`.

Each stage is one PR. Remi merges every PR and starts every stage.

## Definition of done

1. As AA or YGB, the Inbox utility renders Inbox · Messages; as a 9-key org, Inbox alone. Every tab slot in the app renders the V2 row — the V1 fallback fires nowhere.
2. `/admin/messages?t=<threadId>` 308s to `/admin/inbox/messages?t=<threadId>` and the thread opens — an Inbox pointer clicked before the cutover lands exactly where one clicked after it does.
3. The chat at its seat is the V1 chat: dark chrome, polling, optimistic send, the gate — a re-export, pinned thin.
4. The Inbox feed is untouched, and its pointers keep landing (their V1-shaped hrefs ride the new 308 like every stored link).
5. The reserved comments seat is still reserved: no `entity_comments` UI anywhere.
6. With the V2 flag off, everything except the one new 308 is byte-for-byte V1.
7. No migrations: the ledger check sees nothing from this spec.

## Failure modes

**The `?t=` drops.** The stored shapes were pinned for six specs precisely for this moment. The crawl asserts the param on the 308; the page re-export passes `searchParams` through by construction.

**The dark chrome breaks under the host.** The chat carries its own `bg-ink` shell inside the page — a re-export moves it whole. A host that wrapped it in the standard light chrome would ship a broken screen; the pin holds the host to a bare re-export.

**"While we're in there."** An approvals strip, a comments panel, a feed restyle — the last cutover is the worst place for any of them. One row moves; everything else is pinned still.

**The contract quietly deleted instead of discharged.** The stored-shapes test must flip to assert the translation, not vanish — the map owes those URLs an answer forever, and the test is the record.

## Open decisions (recommendations inline — nothing starts until Remi rules)

1. **The Messages seat's shape.** Pure B2 host vs any restructure (folding the feed and chat into one screen, restyling the chrome). **Recommendation: pure host** — the chat is a working, distinctly-styled surface; the model already gives it its own tab; a unification is a product redesign no cutover should smuggle.

2. **The Reed approvals slice.** The recon binds `reed_drafts` approvals to Inbox; today `/admin/reed` owns them and its own at-cutover row says it "becomes the contextual panel." **Recommendation: defer to the panel work** — one owner at a time; when the panel spec runs, it decides what surfaces in Inbox.

3. **The comments seat.** R11 signed `entity_comments` dormant with a reserved seat alongside Messages. **Recommendation: stays reserved and empty** (the journeys shape) — the tables are untouched, the seat is on the record, and nothing ships until comments become real work.

---

*Drafted 2026-09-09, pending Remi's approval. X1 begins only on his kickoff.*
