import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeetingDetail } from "@/lib/meetings/read";
import MeetingDetailClient from "./MeetingDetailClient";

export const dynamic = "force-dynamic";

const ORG_TZ = "America/Los_Angeles";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: ORG_TZ,
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function MeetingDetailPage({ params }: { params: { id: string } }) {
  const detail = await getMeetingDetail(params.id);
  if (!detail) notFound();

  return (
    <div className="max-w-4xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <header>
        <Link
          href="/admin/meetings"
          className="text-xs text-ink-2 hover:text-ink-1 inline-block mb-2"
        >
          ← Meetings
        </Link>
        <h1 className="font-display font-black uppercase tracking-tight text-ink-1 text-2xl sm:text-3xl leading-tight">
          {detail.record.title ?? "(untitled meeting)"}
        </h1>
        <p className="mt-2 text-sm text-ink-2">{fmtDateTime(detail.record.occurred_at)}</p>
      </header>

      <MeetingDetailClient detail={detail} />
    </div>
  );
}
