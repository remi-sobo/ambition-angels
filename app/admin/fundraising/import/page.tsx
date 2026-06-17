import PageHeader from "../../_components/PageHeader";
import ImportWizard from "./_components/ImportWizard";

// Epic M2 — CSV import. Bulk-load donor (and optional gift) history; dedupes by
// email against existing constituents.
export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1000px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader title="Import" subtitle="Bring in donors & gift history from a CSV" />
        <ImportWizard />
      </div>
    </div>
  );
}
