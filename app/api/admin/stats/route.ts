import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isAuthed(req: NextRequest): boolean {
  return req.cookies.get("admin_auth")?.value === process.env.ADMIN_PASSWORD;
}

function mode<T>(arr: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null, bestN = 0;
  counts.forEach((n, v) => { if (n > bestN) { bestN = n; best = v; } });
  return best;
}

function computeStats(submissions: Record<string, unknown>[]) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const thisMonth = submissions.filter((s) => (s.created_at as string) >= startOfMonth).length;
  const allTime = submissions.length;

  const withEmail = submissions.filter((s) => typeof s.email === "string" && s.email.includes("@")).length;
  const emailRate = allTime ? Math.round((withEmail / allTime) * 100) : 0;

  const teens = submissions.filter((s) => s.audience === "teen").length;
  const adults = submissions.filter((s) => s.audience === "adult").length;

  // Career breakdown from first match of each submission
  const careerCounts: Record<string, number> = {};
  for (const s of submissions) {
    const matches = s.career_matches as { title: string }[] | null;
    const top = Array.isArray(matches) ? matches[0]?.title : null;
    if (top) careerCounts[top] = (careerCounts[top] ?? 0) + 1;
  }
  const sortedCareers = Object.entries(careerCounts).sort((a, b) => b[1] - a[1]);
  const topCareer = sortedCareers[0]?.[0] ?? "N/A";
  const careerBreakdown = sortedCareers.slice(0, 15).map(([title, count]) => ({ title, count }));

  // Avg money vs meaning
  const scores = submissions
    .map((s) => s.money_vs_meaning as number | null)
    .filter((v): v is number => v !== null && v !== undefined);
  const avgMoneyVsMeaning =
    scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : 0;

  // Most common age / location / work style
  const ages = submissions.map((s) => s.age as string).filter(Boolean);
  const locations = submissions.map((s) => s.location as string).filter(Boolean);
  const workStyles = submissions.flatMap((s) => {
    const ws = s.work_style as string | null;
    return ws ? ws.split(",").map((w) => w.trim()).filter(Boolean) : [];
  });

  return {
    thisMonth,
    allTime,
    withEmail,
    emailRate,
    teens,
    adults,
    topCareer,
    careerBreakdown,
    avgMoneyVsMeaning,
    mostCommonAge: mode(ages) ?? "N/A",
    mostCommonLocation: mode(locations) ?? "N/A",
    mostCommonWorkStyle: mode(workStyles) ?? "N/A",
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("quiz_submissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const submissions = data ?? [];
  const stats = computeStats(submissions);

  return NextResponse.json({ submissions, stats });
}
