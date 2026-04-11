import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () => createClient(
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

  const supabase = getSupabase();
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

  // ── Aggregate stats ──────────────────────────────────────────────────────
  const succeededDonations = donations.filter((d) => !d.status || d.status === "succeeded");

  const totalRaised = succeededDonations.reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const thisMonthRaised = succeededDonations
    .filter((d) => d.created_at >= startOfMonth)
    .reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const donorsThisMonth = new Set(
    succeededDonations
      .filter((d) => d.created_at >= startOfMonth)
      .map((d) => d.email)
      .filter(Boolean)
  ).size;

  const uniqueEmails = new Set(succeededDonations.map((d) => d.email).filter(Boolean));
  const donorCount = uniqueEmails.size;

  const recurringDonors = new Set(
    succeededDonations.filter((d) => d.recurring).map((d) => d.email).filter(Boolean)
  ).size;

  const avgGift = succeededDonations.length > 0
    ? totalRaised / succeededDonations.length
    : 0;

  // ── Donor profiles (group by email, top 20) ──────────────────────────────
  const profileMap = new Map<string, {
    email: string;
    firstName: string | null;
    lastName: string | null;
    totalGiven: number;
    donationCount: number;
    firstDonation: string;
    lastDonation: string;
    recurring: boolean;
    lastAmount: number;
  }>();

  for (const d of succeededDonations) {
    const key = d.email ?? `anon-${d.id}`;
    const existing = profileMap.get(key);
    const firstName = d.first_name ?? (d.name ? d.name.split(" ")[0] : null) ?? null;
    const lastName  = d.last_name  ?? (d.name ? d.name.split(" ").slice(1).join(" ") : null) ?? null;

    if (!existing) {
      profileMap.set(key, {
        email: d.email ?? "Anonymous",
        firstName,
        lastName,
        totalGiven: d.amount ?? 0,
        donationCount: 1,
        firstDonation: d.created_at,
        lastDonation: d.created_at,
        recurring: !!d.recurring,
        lastAmount: d.amount ?? 0,
      });
    } else {
      existing.totalGiven += d.amount ?? 0;
      existing.donationCount += 1;
      if (d.created_at < existing.firstDonation) existing.firstDonation = d.created_at;
      if (d.created_at > existing.lastDonation) {
        existing.lastDonation = d.created_at;
        existing.lastAmount = d.amount ?? 0;
      }
      if (d.recurring) existing.recurring = true;
    }
  }

  const donorProfiles = Array.from(profileMap.values())
    .sort((a, b) => b.totalGiven - a.totalGiven)
    .slice(0, 20);

  // ── Recent 20 donations ──────────────────────────────────────────────────
  const recentDonations = donations.slice(0, 20);

  return NextResponse.json({
    donations: recentDonations,
    totalRaised,
    thisMonthRaised,
    donorCount,
    donorsThisMonth,
    recurringDonors,
    avgGift,
    donorProfiles,
  });
}
