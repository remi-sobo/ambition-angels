import BoardReport from "./BoardReport";

// The V1 board-report route. The whole one-pager lives in BoardReport
// (extracted at Spec Finance N3) so the Reports screen hosts it at
// ?view=board; here it renders unmodified — output byte-identical to the
// pre-N3 page. This route has 308'd to /admin/finance/reports since B2.
export const dynamic = "force-dynamic";

export default async function FinanceReportPage() {
  return <BoardReport />;
}
