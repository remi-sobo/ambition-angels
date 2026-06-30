import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import StrategyRoom, {
  type Angle,
  type Tone,
  type RoomMeta,
  type RoomStat,
  type RoomYearItem,
} from "./StrategyRoom";

// Internal reference page. Gated at the edge (see middleware.ts) and kept out
// of search indexes belt-and-suspenders, even though crawlers never get past
// the gate. It is intentionally absent from the public <Nav>.
export const metadata: Metadata = {
  title: "Strategy Room",
  robots: { index: false, follow: false, nocache: true },
};

// Read live on every load so an admin edit (or a Reed-drafted angle) shows here
// without a deploy. Funders reach this page via the password gate and carry no
// Supabase session, so the read goes through the service-role client scoped to
// the resident org — not getOrgContext.
export const dynamic = "force-dynamic";

// status_badge slug -> the human tag the deck prints ("North Star", etc.).
const TAG_LABEL: Record<string, string> = {
  "north-star": "North Star",
  proven: "Proven",
  building: "Building",
  reframed: "Reframed",
  productizing: "Productizing",
  "core-thesis": "Core thesis",
  new: "New and timely",
  "emerging-stub": "Emerging stub",
};

type AngleRow = {
  key: string;
  name: string;
  nav_title: string | null;
  status_badge: string | null;
  tone: string | null;
  hook: string | null;
  frame: string | null;
  lead: string | null;
  funds_label: string | null;
  funds: string | null;
  want: string | null;
  catch_label: string | null;
  catch_body: string | null;
  ask: string | null;
  flag: string | null;
};

const TONES: Tone[] = ["primary", "soft", "neutral"];
const toTone = (v: string | null): Tone => (TONES.includes(v as Tone) ? (v as Tone) : "neutral");

async function loadAngles(): Promise<Angle[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: org } = await supabase
      .from("orgs").select("id").eq("slug", "ambition-angels").maybeSingle();
    if (!org?.id) return [];
    const { data, error } = await supabase
      .from("strategy_angles")
      .select(
        "key, name, nav_title, status_badge, tone, hook, frame, lead, funds_label, funds, want, catch_label, catch_body, ask, flag",
      )
      .eq("org_id", org.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error || !data) return [];
    return (data as AngleRow[]).map((r, i) => ({
      num: String(i + 1).padStart(2, "0"),
      id: r.key,
      title: r.name,
      navTitle: r.nav_title || r.name,
      tag: r.status_badge ? TAG_LABEL[r.status_badge] ?? r.status_badge : "",
      tone: toTone(r.tone),
      hook: r.hook ?? "",
      frame: r.frame ?? "",
      lead: r.lead ?? "",
      fundsLabel: r.funds_label || "Who funds this",
      funds: r.funds ?? "",
      want: r.want ?? "",
      catch: r.catch_body ? { label: r.catch_label || "The catch", body: r.catch_body } : undefined,
      ask: r.ask ?? "",
      flag: r.flag || undefined,
    }));
  } catch {
    // Any read failure falls back to the seed copy baked into StrategyRoom.
    return [];
  }
}

// Coerce a jsonb array of objects to a typed list, dropping malformed entries.
function asList<T>(v: unknown, keys: (keyof T)[]): T[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => {
      const out = {} as Record<string, string>;
      for (const k of keys) out[k as string] = typeof x[k as string] === "string" ? (x[k as string] as string) : "";
      return out as T;
    });
}

type MetaRow = {
  eyebrow: string | null;
  headline: string | null;
  headline_accent: string | null;
  subtitle: string | null;
  stats: unknown;
  this_year_heading: string | null;
  year_intro: string | null;
  this_year: unknown;
};

async function loadMeta(): Promise<RoomMeta | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: org } = await supabase
      .from("orgs").select("id").eq("slug", "ambition-angels").maybeSingle();
    if (!org?.id) return null;
    const { data, error } = await supabase
      .from("strategy_room_meta")
      .select("eyebrow, headline, headline_accent, subtitle, stats, this_year_heading, year_intro, this_year")
      .eq("org_id", org.id)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as MetaRow;
    return {
      eyebrow: r.eyebrow ?? "",
      headline: r.headline ?? "",
      headlineAccent: r.headline_accent ?? "",
      subtitle: r.subtitle ?? "",
      stats: asList<RoomStat>(r.stats, ["value", "label"]),
      thisYearHeading: r.this_year_heading ?? "",
      yearIntro: r.year_intro ?? "",
      thisYear: asList<RoomYearItem>(r.this_year, ["label", "body"]),
    };
  } catch {
    return null; // falls back to FALLBACK_META in StrategyRoom
  }
}

export default async function StrategyPage() {
  const [angles, meta] = await Promise.all([loadAngles(), loadMeta()]);
  return <StrategyRoom angles={angles} meta={meta} />;
}
