import { NextResponse } from "next/server";
import { websiteDb } from "@/lib/site/websiteDb";
import { fetchAll, type PageableQuery } from "@/lib/supabase/fetchAll";
import { requireSiteAdmin } from "@/lib/site/adminAuth";

// We pull a generous slice of recent rows and let the client filter by
// the selected period (Last 7d / 30d / 90d / All). Cap at 20k rows per
// table — plenty of headroom for an early-stage product, and small
// enough not to balloon the admin payload.
const MAX_ROWS = 20000;

type PageView = {
  id: number | string;
  created_at: string;
  page: string | null;
  referrer: string | null;
  device: string | null;
  browser: string | null;
  session_id: string | null;
  duration_seconds: number | null;
};

type ClickEvent = {
  id: number | string;
  created_at: string;
  event_name: string | null;
  page: string | null;
  session_id: string | null;
  metadata: Record<string, unknown> | null;
};

export async function GET() {
  // Website admin only (SITE_ADMIN_EMAILS).
  const gate = await requireSiteAdmin();
  if (!gate.ok) return gate.response;

  const supabase = websiteDb();

  // Paged: Supabase answers at most 1,000 rows per request, silently. One
  // .limit(20000) call used to return only the newest 1,000 page views.
  const [pvRes, evRes] = await Promise.all([
    fetchAll<PageView>(
      () =>
        supabase
          .from("page_views")
          .select("id, created_at, page, referrer, device, browser, session_id, duration_seconds") as unknown as PageableQuery<PageView>,
      { order: [{ column: "created_at", ascending: false }, "id"], hardCap: MAX_ROWS },
    ),
    fetchAll<ClickEvent>(
      () =>
        supabase
          .from("click_events")
          .select("id, created_at, event_name, page, session_id, metadata") as unknown as PageableQuery<ClickEvent>,
      { order: [{ column: "created_at", ascending: false }, "id"], hardCap: MAX_ROWS },
    ),
  ]);

  if (pvRes.error) {
    return NextResponse.json({ error: pvRes.error.message }, { status: 500 });
  }
  if (evRes.error) {
    return NextResponse.json({ error: evRes.error.message }, { status: 500 });
  }

  const pageViews: PageView[] = pvRes.data ?? [];
  const events: ClickEvent[] = evRes.data ?? [];

  // All-time event tallies (used in the Key Events table comparison column)
  const eventsAllTime: Record<string, number> = {};
  for (const e of events) {
    if (!e.event_name) continue;
    eventsAllTime[e.event_name] = (eventsAllTime[e.event_name] ?? 0) + 1;
  }

  return NextResponse.json({
    pageViews,
    events,
    eventsAllTime,
  });
}
