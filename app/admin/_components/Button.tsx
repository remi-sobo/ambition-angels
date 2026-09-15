/**
 * Compatibility re-export.
 *
 * The button primitive moved to `_components/ui/Button` as part of the Visual
 * System V3 pass, where it lost the `rounded-full` capsule (V3 §4 reserves the
 * 999px radius for statuses, filters, badges, tags and counts) and picked up
 * the 9px control radius, the §2 button type role, and a link twin.
 *
 * Existing call sites import from here, so this file forwards rather than
 * forking — one definition, two paths, no drift.
 */
export { default, ButtonLink } from "./ui/Button";
export type { ButtonVariant, ButtonSize } from "./ui/Button";
