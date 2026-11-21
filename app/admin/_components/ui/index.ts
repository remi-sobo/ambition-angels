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
export { default as PageHeader, IdentityChip } from "../PageHeader";
export type { Crumb } from "../PageHeader";
export { default as SectionHeading } from "../SectionHeading";

// Surfaces
export { default as Card, CardHeader, CardMetric, CardFooter } from "./Card";
export type { CardTone } from "./Card";
export { default as StatCard } from "../StatCard";
export type { StatCardProps, Delta } from "../StatCard";
export { default as Figure, SummaryStrip } from "./Figure";
export type { FigureProps } from "./Figure";
// <MetricFigure> (catalog-fed Figure) is a server component that reads the
// org's metric catalog; import it from "../MetricFigure" directly so client
// components that use this barrel never pull a server read into their bundle.
export { default as NextStepBar } from "./NextStepBar";
export { default as EmptyState } from "../EmptyState";
export { default as Alert } from "./Alert";
export type { AlertTone } from "./Alert";
export { default as Notice } from "./Notice";
export type { NoticeTone } from "./Notice";
export {
  SkeletonBlock,
  SkeletonGroup,
  SkeletonHeader,
  SkeletonFigure,
  SkeletonStrip,
  SkeletonTable,
  SkeletonTimeline,
} from "./Skeleton";

// Overlays (one focus-trap behaviour, shared)
export { default as Modal } from "./Modal";
export { default as Drawer } from "./Drawer";
export { default as Stage } from "./Stage";
// The shared focus trap lives in ./useFocusTrap (a "use client" hook).
// Import it from there in client code; a hook re-exported here would be
// read as a value through a server module (tests/client-boundary.test.ts).
export { default as MoreActionsMenu } from "./MoreActionsMenu";
export type { MenuAction } from "./MoreActionsMenu";

// Controls
export { default as Button, ButtonLink, buttonClass } from "./Button";
export type { ButtonVariant, ButtonSize, ButtonProps } from "./Button";
export { default as Input, Field, Select, Textarea, Checkbox, fieldDescribedBy } from "./Input";
export type { ControlSize } from "./Input";
export { TextField, SelectField, TextareaField, DateField, CheckboxField } from "./Field";
export type { SelectOption } from "./Field";

// List page controls
export { default as FilterRow } from "./FilterRow";
export type { QuickFilter } from "./FilterRow";
export { default as SavedViews, SaveViewButton } from "./SavedViews";
export type { SavedView } from "./SavedViews";
export { default as TableSavedViews } from "./TableSavedViews";
export type { ServerSavedView } from "./TableSavedViews";
export { default as DataTable, DataTableSkeleton, StaticTable } from "./DataTable";
export type { DataTableColumn, DataTableBulkAction } from "./DataTable";
// The client half of DataTable. Pages use <DataTable>; exported so the barrel
// covers every kit file (tests/kit-tokens.test.ts).
export { default as DataTableFrame } from "./DataTableFrame";

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
export { default as Timeline, TimelineChip } from "./Timeline";
export type { TimelineEntry, TimelineFilter } from "./Timeline";
