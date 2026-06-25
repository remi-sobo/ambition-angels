"use client";

import { useState } from "react";
import CaptureBox from "./CaptureBox";
import ReedPanel from "./reed/ReedPanel";
import ReportModal from "../ReportModal";

/**
 * The pinned bottom dock: the resting capture lane, the Reed panel that blooms
 * up over it when summoned, and the rehomed "Report an issue" flow (its old home
 * was the retired FAB). One footer, two altitudes.
 */
export default function CaptureDock() {
  const [report, setReport] = useState(false);
  const openReport = () => setReport(true);

  return (
    <>
      <CaptureBox onReport={openReport} />
      <ReedPanel onReport={openReport} />
      {report && <ReportModal onClose={() => setReport(false)} />}
    </>
  );
}
