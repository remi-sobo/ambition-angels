"use client";

import { useState } from "react";
import Button, { type ButtonVariant } from "./ui/Button";
import ReportModal from "./ReportModal";
import { REPORT_ACTION } from "@/lib/admin/support";

// V4 Stage F: the "report a problem" action, anywhere a screen offers help
// (the setup checklist, the error boundary). Opens the same sheet as the
// + menu's "Report an issue" (app/api/admin/report/route.ts).
export default function ReportProblemButton({
  variant = "secondary",
  label = REPORT_ACTION,
}: {
  variant?: ButtonVariant;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size="md" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <ReportModal onClose={() => setOpen(false)} />}
    </>
  );
}
