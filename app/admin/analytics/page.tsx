"use client";

import AnalyticsView from "../AnalyticsView";
import PageHeader from "../_components/PageHeader";
import PageShell from "../_components/ui/PageShell";

// Impact → Analytics: website analytics, the Dashboard archetype (V4 Stage
// G2: the page frame, PageHeader v2, Figures with sources, DataTable v2).
// AnalyticsView fetches its own data; this page is the frame around it.
export default function AnalyticsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Website analytics"
        subtitle="Who visits the public site, what they read and what they click. Counts come from the site's own page-view log."
      />
      <AnalyticsView />
    </PageShell>
  );
}
