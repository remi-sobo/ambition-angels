import type { Metadata } from "next";
import Link from "next/link";
import PageVisitedEvent from "@/components/PageVisitedEvent";
import { getSupabasePublic } from "@/lib/supabase/public";
import type { MeetingType } from "@/lib/database.types";
import { MEET_ICON_MAP, type MeetIconName } from "./icons";

export const metadata: Metadata = {
  title: "Meet with Remi | Ambition Angels",
  description:
    "Pick the kind of conversation that fits your reason for reaching out. I'll show up ready.",
};

export const revalidate = 60;

async function fetchTypes(): Promise<MeetingType[]> {
  const supabase = getSupabasePublic();
  const { data, error } = await supabase
    .from("meeting_types")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Failed to fetch meeting types", error);
    return [];
  }
  return (data ?? []) as MeetingType[];
}

export default async function MeetPage() {
  const types = await fetchTypes();

  return (
    <>
      <PageVisitedEvent name="meet_landing_viewed" />
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="bg-cream section-pad">
        <div className="container-site">
          <div className="max-w-2xl">
            <div className="inline-block text-xs font-bold text-orange bg-orange/10 border border-orange/30 px-4 py-1.5 rounded-full uppercase tracking-widest mb-6">
              Meet with Remi
            </div>
            <h1 className="font-heading font-bold text-5xl lg:text-6xl text-ink tracking-tight leading-[1.05] mb-6">
              Let&rsquo;s talk.
            </h1>
            <p className="text-gray-warm text-lg leading-relaxed">
              I&rsquo;m Remi, founder of Ambition Angels. Below are the kinds of
              conversations I&rsquo;m having right now. Pick the one that fits
              your reason for reaching out. I&rsquo;ll show up ready.
            </p>
          </div>
        </div>
      </section>

      {/* ── TYPE GRID ────────────────────────────────────────────────── */}
      <section className="bg-[#F5F4F0] section-pad">
        <div className="container-site">
          {types.length === 0 ? (
            <p className="text-gray-warm">
              Meeting types aren&rsquo;t loaded right now. Try again in a moment.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
              {types.map((t) => (
                <TypeCard key={t.id} type={t} />
              ))}
            </div>
          )}

          <p className="mt-12 text-gray-warm">
            Not sure which fits?{" "}
            <Link
              href="/meet/quick-intro"
              className="text-ink underline underline-offset-4 hover:text-orange transition-colors"
            >
              Start with a Quick Intro.
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}

function TypeCard({ type }: { type: MeetingType }) {
  const accent = type.color ?? "#E8500A";
  const Icon =
    type.icon_name && type.icon_name in MEET_ICON_MAP
      ? MEET_ICON_MAP[type.icon_name as MeetIconName]
      : MEET_ICON_MAP.Sparkles;

  return (
    <Link
      href={`/meet/${type.slug}`}
      className="group relative bg-white border border-gray-light hover:border-transparent rounded-card-lg p-7 transition-all hover:shadow-[0_8px_30px_rgba(14,14,14,0.06)] hover:-translate-y-0.5"
      style={{ borderTopColor: accent, borderTopWidth: 3 }}
    >
      <div className="flex items-start justify-between mb-6">
        <span
          className="inline-flex items-center justify-center w-11 h-11 rounded-xl"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          <Icon size={22} strokeWidth={1.75} />
        </span>
        <span className="text-xs font-semibold text-gray-warm uppercase tracking-widest">
          {type.duration_minutes} min
        </span>
      </div>
      <h3 className="font-heading font-bold text-2xl text-ink tracking-tight leading-tight mb-2">
        {type.name}
      </h3>
      <p className="text-gray-warm text-base leading-relaxed mb-4">
        {type.description}
      </p>
      {type.who_its_for ? (
        <p className="text-xs text-gray-warm/80 leading-relaxed mb-6">
          <span className="font-semibold uppercase tracking-widest text-gray-warm">
            For
          </span>{" "}
          {type.who_its_for}
        </p>
      ) : null}
      <span
        className="absolute bottom-6 right-7 text-sm font-semibold transition-colors"
        style={{ color: accent }}
      >
        Book →
      </span>
    </Link>
  );
}
