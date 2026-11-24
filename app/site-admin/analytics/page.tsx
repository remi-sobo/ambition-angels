import PageHeader from "@/app/admin/_components/PageHeader";
import AnalyticsView from "./AnalyticsView";

// Website analytics: page views and click events from the site's own log.
// Moved here from BloomOS (Impact → Analytics) with the repo split.
export default function AnalyticsPage() {
  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader
        title="Website analytics"
        subtitle="Who visits the public site, what they read and what they click."
      />
      <AnalyticsView />
    </div>
  );
}
