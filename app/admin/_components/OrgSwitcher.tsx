"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Sidebar-footer org switcher (core fence spec §6c, C1). Rendered only when
// the user holds 2+ memberships — the parent gates on orgs.length, and this
// component re-checks so a stray single-org render stays invisible. Switching
// POSTs to /api/admin/org/switch (which validates membership and sets the
// bloom_active_org cookie), then router.refresh() re-renders every server
// component under the new org scope.
export default function OrgSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: { orgId: string; orgName: string }[];
  activeOrgId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (orgs.length < 2) return null;

  const switchTo = async (orgId: string) => {
    if (orgId === activeOrgId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/org/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className="block">
      <span className="block px-1 mb-1 text-[10px] uppercase tracking-[0.08em] text-[#8d7c63]">
        Organization
      </span>
      <select
        value={activeOrgId}
        onChange={(e) => switchTo(e.target.value)}
        disabled={busy}
        className="w-full bg-white/[0.06] border border-white/[0.10] rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-cream cursor-pointer disabled:opacity-50"
      >
        {orgs.map((o) => (
          <option key={o.orgId} value={o.orgId} className="bg-navy text-cream">
            {o.orgName}
          </option>
        ))}
      </select>
    </label>
  );
}
