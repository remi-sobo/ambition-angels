/**
 * Compliance calendar rules (V4 Stage G). PURE: the view a row falls in and
 * its next step, shared by the list page and tests.
 */
export type CalendarView = "open" | "overdue" | "soon" | "closed" | "all";
export const CALENDAR_VIEWS: { key: CalendarView; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "soon", label: "Next 60 days" },
  { key: "closed", label: "Filed or waived" },
  { key: "all", label: "All" },
];

type ItemLike = { status: string; due_date: string; recur: string };

const isOpen = (i: ItemLike) => i.status === "upcoming" || i.status === "in_progress";
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function inView(i: ItemLike, view: CalendarView, today: string, windowDays = 60): boolean {
  const open = isOpen(i);
  switch (view) {
    case "open":
      return open;
    case "overdue":
      return open && i.due_date < today;
    case "soon":
      return open && i.due_date >= today && days(today, i.due_date) <= windowDays;
    case "closed":
      return !open;
    default:
      return true;
  }
}

export function complianceNextStep(i: ItemLike, today: string): { text: string; tone: "late" | "due" | "quiet" } {
  if (!isOpen(i)) return { text: i.status === "waived" ? "Waived" : "Filed", tone: "quiet" };
  const d = days(today, i.due_date);
  const verb = i.status === "in_progress" ? "Finish and file" : "File";
  if (d < 0) return { text: `${-d} ${-d === 1 ? "day" : "days"} late. ${verb} or waive`, tone: "late" };
  if (d === 0) return { text: `${verb} today`, tone: "late" };
  if (d <= 14) return { text: `${verb} within ${d} ${d === 1 ? "day" : "days"}`, tone: "due" };
  return { text: `Due in ${d} days`, tone: "quiet" };
}
