import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeetingDetail } from "@/lib/meetings/read";
import { StatusPill } from "../_ui";
import MeetingDetailClient from "./MeetingDetailClient";
import { TYPE } from "@/lib/admin/typeScale";

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
  const { record } = detail;

  return (
    <div className="max-w-4xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <header>
        <Link
          href="/admin/meetings"
          className="text-xs text-ink-2 hover:text-ink-1 inline-flex items-center gap-1 mb-3"
        >
          ← Meetings
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className={TYPE.displayTitle}>
              {record.title ?? "Untitled meeting"}
            </h1>
            <p className="mt-2 text-sm text-ink-2">{fmtDateTime(record.occurred_at)}</p>
          </div>
          <div className="pt-1">
            <StatusPill status={record.follow_up_status} />
          </div>
        </div>
      </header>

      <MeetingDetailClient detail={detail} />
    </div>
  );
}
