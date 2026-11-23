"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Card from "@/app/admin/_components/ui/Card";
import Button from "@/app/admin/_components/ui/Button";
import { TYPE } from "@/lib/admin/typeScale";
import { clearAdminCaches } from "@/lib/admin/swCache";

/**
 * The standalone frame for the two-step screens (enroll, verify). No admin
 * chrome: the session has not finished signing in, so getOrgContext is null
 * and the admin layout renders its bare surface around this.
 */
export default function TwoStepFrame({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      await clearAdminCaches();
    } finally {
      window.location.assign("/admin");
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-8 text-ink-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/admin/bloomos-mark.png" alt="" width={32} height={32} className="rounded-panel shrink-0" />
          <span className="font-display font-black text-2xl tracking-tight normal-case leading-none">
            Bloom<span className="text-[#A8B58C]">OS</span>
          </span>
        </div>
        <Card className="p-6 sm:p-8">
          <h1 className={TYPE.pageTitle}>{title}</h1>
          <div className={`${TYPE.bodyMuted} mt-2 mb-6`}>{intro}</div>
          {children}
        </Card>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className={TYPE.metadata}>{footer}</div>
          <Button variant="quiet" size="sm" onClick={() => void signOut()} loading={signingOut}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
