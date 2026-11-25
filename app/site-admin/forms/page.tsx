import PageHeader from "@/app/site-admin/_ui/PageHeader";
import { getSiteAdmin } from "@/lib/site/adminAuth";
import StatCard from "@/app/site-admin/_ui/StatCard";
import { getSiteSupabase } from "@/lib/site/supabase";
import RetryButton from "./RetryButton";

// Form delivery health: what the website sent to BloomOS in the last 30
// days, and anything stuck in the outbox. Delivery status only. The records
// themselves live in BloomOS, one link away. No names or emails here.

export const dynamic = "force-dynamic";

const BLOOMOS = "https://app.bloomos.org";
const RECORD_LINK: Record<string, (id: string) => string> = {
  application: () => `${BLOOMOS}/admin/programs/intake`,
  partner_inquiry: (id) => `${BLOOMOS}/admin/partners/${id}`,
  company_contact: () => `${BLOOMOS}/admin/legacy`,
  coach_signup: () => `${BLOOMOS}/admin/programs/coach`,
  ygb_registration: () => `${BLOOMOS}/admin/ygb`,
  demoday_signup: () => `${BLOOMOS}/admin/demoday`,
  quiz_submission: () => `${BLOOMOS}/admin/legacy`,
  donation: () => `${BLOOMOS}/admin/donations`,
};

type Row = {
  id: string;
  kind: string;
  status: "pending" | "delivered" | "dead";
  attempts: number;
  last_error: string | null;
  bloomos_id: string | null;
  created_at: string;
  delivered_at: string | null;
};

export default async function FormsPage() {
  // Every page checks sign-in itself. The layout's sign-in screen is not
  // enough: Next renders the page alongside it, so an unguarded page would
  // ship its data to a signed-out visitor.
  if (!(await getSiteAdmin())) return null;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await getSiteSupabase()
    .from("intake_outbox")
    .select("id, kind, status, attempts, last_error, bloomos_id, created_at, delivered_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as Row[];
  const stuck = rows.filter((r) => r.status !== "delivered");
  const kinds = Array.from(new Set(rows.map((r) => r.kind))).sort();

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader title="Forms" subtitle="Website forms sent to BloomOS, last 30 days." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Sent" value={rows.length} />
        <StatCard label="Delivered" value={rows.filter((r) => r.status === "delivered").length} />
        <StatCard label="Waiting" value={rows.filter((r) => r.status === "pending").length} muted={!stuck.length} />
        <StatCard label="Rejected" value={rows.filter((r) => r.status === "dead").length} muted />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading font-semibold text-sm">Waiting or rejected</h2>
        <RetryButton disabled={!rows.some((r) => r.status === "pending")} />
      </div>
      {stuck.length === 0 ? (
        <p className="text-sm text-gray-warm mb-8">Nothing stuck.</p>
      ) : (
        <table className="w-full text-sm mb-8">
          <thead>
            <tr className="text-left text-xs text-gray-warm">
              <th className="py-2">Received</th><th>Form</th><th>Status</th><th>Attempts</th><th>Last error</th>
            </tr>
          </thead>
          <tbody>
            {stuck.map((r) => (
              <tr key={r.id} className="border-t border-gray-light align-top">
                <td className="py-2">{new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</td>
                <td>{r.kind}</td>
                <td>{r.status === "dead" ? "rejected" : "waiting"}</td>
                <td>{r.attempts}</td>
                <td className="text-xs text-gray-warm">{r.last_error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="font-heading font-semibold text-sm mb-3">By form</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-warm"><th className="py-2">Form</th><th>Delivered</th><th>Waiting</th><th>Latest</th></tr>
        </thead>
        <tbody>
          {kinds.map((k) => {
            const of = rows.filter((r) => r.kind === k);
            const latest = of.find((r) => r.status === "delivered");
            return (
              <tr key={k} className="border-t border-gray-light">
                <td className="py-2">{k}</td>
                <td>{of.filter((r) => r.status === "delivered").length}</td>
                <td>{of.filter((r) => r.status === "pending").length}</td>
                <td>
                  {latest?.bloomos_id ? (
                    <a href={RECORD_LINK[k]?.(latest.bloomos_id) ?? `${BLOOMOS}/admin`} className="underline">
                      Open in BloomOS ↗
                    </a>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
