"use client";

import Button from "@/app/admin/_components/ui/Button";

// Opens the browser's print dialog (Save as PDF). The report page scopes an
// @media print rule to #board-report, so only the report prints, not the
// admin chrome or this button (.no-print).
export default function PrintButton() {
  return (
    <Button onClick={() => window.print()} className="no-print">
      Print or save as PDF
    </Button>
  );
}
