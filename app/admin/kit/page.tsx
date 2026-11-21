import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/admin/auth";
import PageShell from "../_components/ui/PageShell";
import KitGallery from "./_components/KitGallery";

/**
 * /admin/kit: the V4 shared UI kit review page (Stage A1).
 *
 * Every kit component in every state, with made-up data, plus three composed
 * samples from the approved prototypes (Main, Donor, GiftFlow). The owner and
 * later stages use it to check the kit before pages migrate.
 *
 * Owner and admin only (anyone else gets the admin 404), not in the nav,
 * never indexed. `?drawer=gift` opens the gift drawer on load, for
 * screenshots.
 */
export const metadata: Metadata = {
  title: "UI kit",
  robots: { index: false, follow: false },
};

export default async function KitPage({ searchParams }: { searchParams: { drawer?: string } }) {
  const ctx = await getOrgContext();
  if (!ctx || (ctx.role !== "owner" && ctx.role !== "admin")) notFound();
  return (
    <PageShell>
      <KitGallery initialDrawer={searchParams.drawer === "gift" ? "gift" : null} />
    </PageShell>
  );
}
