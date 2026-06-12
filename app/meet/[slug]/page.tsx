import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabasePublic } from "@/lib/supabase/public";
import type { MeetingType } from "@/lib/database.types";
import BookingFlow from "./booking-flow";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await fetchType(params.slug);
  if (!t) return { title: "Meet with Remi" };
  return {
    title: `${t.name} with Remi`,
    description: t.description ?? undefined,
  };
}

async function fetchType(slug: string): Promise<MeetingType | null> {
  const supabase = getSupabasePublic();
  const { data, error } = await supabase
    .from("meeting_types")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    console.error("Failed to fetch meeting type", error);
    return null;
  }
  return data as MeetingType | null;
}

export default async function BookingPage({ params }: Props) {
  const meetingType = await fetchType(params.slug);
  if (!meetingType) notFound();
  return <BookingFlow meetingType={meetingType} />;
}
