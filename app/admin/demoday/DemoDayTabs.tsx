"use client";

import { useState } from "react";
import DemoDayTracker from "./DemoDayTracker";
import DemoDaySignups from "./DemoDaySignups";

type Tab = "contacts" | "signups";

const TABS: { value: Tab; label: string }[] = [
  { value: "contacts", label: "Contacts" },
  { value: "signups", label: "Signups" },
];

export default function DemoDayTabs() {
  const [tab, setTab] = useState<Tab>("contacts");

  return (
    <div>
      {/* Tab switcher */}
      <div className="px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
        <div className="inline-flex rounded-lg border-[1.5px] border-outline bg-surface shadow-panel p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === t.value
                  ? "bg-orange text-white"
                  : "text-ink-2 hover:text-ink-1 hover:bg-[#EFE6D4]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* The active view keeps its own header + content. Negative top margin
          trims the doubled-up top padding so the tab bar sits close to it. */}
      <div className="-mt-2">
        {tab === "contacts" ? <DemoDayTracker /> : <DemoDaySignups />}
      </div>
    </div>
  );
}
