"use client";

import type { ComponentType } from "react";
import type { OpsTask } from "@/app/admin/ops/_types/ops";
import type { TodayObligation } from "@/lib/admin/today";
import OpsTaskPanel, { type TaskPatch } from "./OpsTaskPanel";
import AckPanel, { type AckChoice } from "./AckPanel";

/**
 * Per-type popout bodies. The shell (NeedsYouPopout) renders whatever is
 * registered for the row's type, and the shell alone for anything else: the
 * fallback is "no entry", so a new obligation type is clickable on day one and
 * gets quick actions when its panel lands here (PR 5+:
 * compliance_item, metric_stale, session_unrecorded, grant_requirement,
 * document_renewal).
 */

export type PanelProps = {
  row: TodayObligation;
  onLoaded: (task: OpsTask | null) => void;
  onPatched: (patch: TaskPatch) => void;
  /** Thank-yous: the channel and the linked tasks to close with Mark thanked. */
  onAckChoice: (choice: AckChoice) => void;
};

export const PANELS: Partial<Record<string, ComponentType<PanelProps>>> = {
  ops_task: OpsTaskPanel,
  acknowledgment: AckPanel,
};
