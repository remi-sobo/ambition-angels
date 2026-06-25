import type { ReactNode } from "react";

/**
 * Reed context contract — the slot + handshake this spec owns.
 *
 * Reed's internals (model, tools, conversation UI) are built separately. This
 * file is the integration seam: it defines exactly what the rail hands Reed, so
 * the other build can render its panel body behind `ReedMount` without the rail
 * needing to know anything about Reed. Keep this stable.
 *
 * The shared current-entity context (RailEntityContext) is the single source of
 * truth for "what am I looking at" — the same value drives the capture
 * auto-link chip and the `entity` field here, so capture and Reed never
 * disagree about the current entity.
 */
export type ReedEntityRef = {
  type: "partner" | "constituent";
  id: string;
  label: string;
};

export type ReedContext = {
  /** The admin route the user was on when Reed was summoned. */
  page: string;
  /** The entity the context chip is showing, or null (unscoped). */
  entity: ReedEntityRef | null;
  /** Text escalated from the capture box via "Ask Reed", if any. */
  draft: string;
};

/**
 * The component the external Reed build supplies to render the panel body.
 * Until it lands, ReedPanel renders an inert "warming up" stub in its place —
 * the slot is present, never a crash (spec failure mode: "Reed slot shipping
 * ahead of Reed").
 */
export type ReedMountProps = { context: ReedContext; onClose: () => void };
export type ReedMount = (props: ReedMountProps) => ReactNode;
