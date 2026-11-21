"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import Drawer from "@/app/admin/_components/ui/Drawer";

/**
 * The client frame of the research drawer (V4 P1): the kit Drawer, opened by
 * the URL (?drawer=research) and closed by navigating to closeHref, so the
 * drawer stays a link you can share. Escape, the scrim and the close button
 * all take the same path. The contents are server-rendered and passed in.
 */
export default function ResearchDrawerShell({ closeHref, children }: { closeHref: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <Drawer
      open
      onClose={() => router.push(closeHref, { scroll: false })}
      title="Prospect Research"
      description="ai.prospect_research"
      width={760}
    >
      {children}
    </Drawer>
  );
}
