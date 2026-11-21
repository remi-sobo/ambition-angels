import { notFound } from "next/navigation";
import { getMeetingDetail } from "@/lib/meetings/read";
import { StatusPill } from "../_ui";
import MeetingDetailClient from "./MeetingDetailClient";
import PageHeader, { IdentityChip } from "../../_components/PageHeader";

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
    <div className="max-w-reading px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      {/* V4 Stage G: breadcrumb, identity chips (when, follow-up state) and
          the follow-up decision as the first panel below. */}
      <PageHeader
        breadcrumb={[{ label: "Meetings", href: "/admin/work/meetings" }]}
        title={record.title ?? "Untitled meeting"}
        chips={
          <>
            <IdentityChip>{fmtDateTime(record.occurred_at)}</IdentityChip>
            <StatusPill status={record.follow_up_status} />
          </>
        }
        moreActions={[{ label: "All meetings", href: "/admin/work/meetings" }]}
      />

      <MeetingDetailClient detail={detail} />
    </div>
  );
}
