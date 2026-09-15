/**
 * The BloomOS design system — Visual System V3 §11.
 *
 * "Before editing dozens of individual screens, refactor the shared design
 * foundation. Avoid repeatedly styling the same primitive independently on
 * different pages."
 *
 * This is that foundation's front door. A screen imports primitives from here
 * and inherits the product's shape language, type scale, spacing rhythm and
 * accessibility behaviour for free. If a screen needs a treatment this barrel
 * does not offer, the fix is to add it HERE, not to hand-roll it on the page —
 * that is the rule the whole pass exists to establish.
 *
 * Tokens (color, radius, elevation) live in app/globals.css + tailwind.config.ts
 * and the type scale in lib/admin/typeScale.ts; nothing below hard-codes a hex.
 */

// Layout
export { default as PageShell, PageSection } from "./PageShell";
export { default as PageHeader } from "../PageHeader";
export { default as SectionHeading } from "../SectionHeading";

// Surfaces
export { default as Card, CardHeader, CardMetric, CardFooter } from "./Card";
export type { CardTone } from "./Card";
export { default as StatCard } from "../StatCard";
export { default as EmptyState } from "../EmptyState";
export { default as Alert } from "./Alert";
export type { AlertTone } from "./Alert";
export { default as Modal } from "./Modal";

// Controls
export { default as Button, ButtonLink } from "./Button";
export type { ButtonVariant, ButtonSize } from "./Button";
export { default as Input, Field, Select, Textarea, Checkbox } from "./Input";

// Navigation
export { default as Tabs, TabLink } from "./Tabs";
export type { TabItem } from "./Tabs";
export { default as SegmentedControl } from "./SegmentedControl";
export type { Segment } from "./SegmentedControl";
export { default as Stepper } from "./Stepper";
export type { StepItem, StepState } from "./Stepper";
export { default as SidebarItem } from "./SidebarItem";

// Data display
export { default as ListRow, ListRows } from "./ListRow";
export { default as Badge, StatusBadge, CountBadge } from "./Badge";
export type { BadgeTone } from "./Badge";
export { StatusChip, CategoryTag, ScoreBadge } from "../StatusChip";
