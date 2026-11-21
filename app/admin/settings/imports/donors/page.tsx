import { redirect } from "next/navigation";

// V4 Stage F: donor and gift import now runs in the one import wizard
// (/admin/settings/imports/csv, target "Donors and gifts"). The older
// client-side wizard (was /admin/fundraising/import) is retired; this seat
// stays so every link to it still lands in the right place.
export const dynamic = "force-dynamic";

export default function Page() {
  redirect("/admin/settings/imports/csv?target=gift");
}
