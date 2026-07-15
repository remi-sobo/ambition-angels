import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeetingDetail } from "@/lib/meetings/read";
import { StatusPill } from "../_ui";
import MeetingDetailClient from "./MeetingDetailClient";
import PageHeader from "../../_components/PageHeader";

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
        <PageHeader
          title={record.title ?? "Untitled meeting"}
          subtitle={fmtDateTime(record.occurred_at)}
          actions={<StatusPill status={record.follow_up_status} />}
        />
      </header>

      <MeetingDetailClient detail={detail} />
    </div>
  );
}
