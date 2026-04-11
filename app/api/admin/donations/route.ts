import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isAuthed(req: NextRequest): boolean {
  return req.cookies.get("admin_auth")?.value === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("donations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const donations = data ?? [];
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const totalRaised = donations.reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const thisMonthRaised = donations
    .filter((d) => d.created_at >= startOfMonth)
    .reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const donorCount = new Set(donations.map((d) => d.email).filter(Boolean)).size;
  const recentDonations = donations.slice(0, 10);

  return NextResponse.json({ donations: recentDonations, totalRaised, thisMonthRaised, donorCount });
}
