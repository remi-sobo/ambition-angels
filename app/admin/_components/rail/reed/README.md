# Reed slot — integration contract

The right rail owns Reed's **slot and context contract**, not Reed's internals
(model, tools, conversation UI). Those are built separately and mount behind the
interface defined here. This doc is the handoff: build against it and the rail
needs no changes.

## The contract

`contract.ts` is the seam. The rail hands Reed exactly one value when summoned:

```ts
type ReedContext = {
  page: string;                 // the admin route the user was on
  entity: ReedEntityRef | null; // { type: "partner" | "constituent"; id; label } or null
  draft: string;                // text escalated from the capture box, if any
};
```

`entity` is the **same** current-entity value that drives the capture auto-link
chip (`RailEntityContext`), so capture and Reed never disagree about "what am I
looking at." It is null on any page that isn't a partner/constituent detail
view — Reed should treat that as unscoped, not an error.

## How to wire Reed (two steps)

1. **Implement `ReedMount`** (`(props: { context, onClose }) => ReactNode`) with
   Reed's real conversation UI, and render it in `ReedPanel.tsx` where the inert
   "warming up" stub currently lives (search for `REED INTEGRATION SEAM`).
2. **Flip `ready`** to `true` where `ReedProvider` is mounted in
   `../Rail.tsx`. While `ready` is false the panel shows the inert state and the
   input is disabled — the slot is present but never pretends to work.

## What the rail already provides

- **Summon state** (`ReedProvider` / `useReed`): `open`, `draft`, `summon(draft?)`,
  `dismiss`. Esc closes the panel.
- **Anchored launcher**: the "Ask Reed" pill in the capture line escalates the
  typed text as `draft` (and leaves it in capture so nothing is lost).
- **Collapsed-state launcher**: an always-on Reed pill when the rail is collapsed.
- **The panel chrome**: espresso surface, the context chip, the escalated draft,
  and the input frame. Reed only needs to fill the body + make the input live.

## Degradation guarantee

The slot must never crash if Reed isn't wired: `useReed` returns inert state
outside a provider, and the panel renders the warming-up body when `ready` is
false. Keep that property — Phase 3 shipped ahead of the Reed build on purpose.
