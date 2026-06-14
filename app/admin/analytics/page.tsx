"use client";

import AnalyticsView from "../AnalyticsView";

// Website Analytics gets its own route (Data › Website Analytics in the
// BloomOS sidebar). The same view also remains reachable from the
// dashboard's Analytics tab; AnalyticsView fetches its own data, so this
// page is just chrome around it. Middleware gates /admin/* on a session.
export default function AnalyticsPage() {
  return (
    <div className="min-h-screen bg-ink">
      <div className="bg-[#19150f] border-b border-white/10 px-4 lg:px-8 py-3 sm:py-4 sticky admin-sticky-top z-30">
        <span className="font-heading font-bold text-cream text-sm sm:text-base">Website Analytics</span>
      </div>
      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8">
        <AnalyticsView />
      </div>
    </div>
  );
}
