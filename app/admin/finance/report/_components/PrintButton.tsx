"use client";

// Triggers the browser's print dialog (→ Save as PDF). The report page scopes
// an @media print rule to #board-report, so only the report prints — not the
// admin chrome or this button (.no-print).
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-full bg-orange hover:bg-orange-dark text-white text-sm font-medium px-4 py-2"
    >
      Print / Save as PDF
    </button>
  );
}
