"use client";

import { useState } from "react";
import CaptureBox from "./CaptureBox";
import ReportModal from "../ReportModal";

/**
 * The pinned bottom dock: the capture lane plus the rehomed "Report an issue"
 * flow (its old home was the retired desktop FAB). Reed itself blooms as the
 * shared drawer from ReedLauncherProvider, opened by capture's "Ask Reed".
 */
export default function CaptureDock({ reedEnabled }: { reedEnabled: boolean }) {
  const [report, setReport] = useState(false);

  return (
    <>
      <CaptureBox reedEnabled={reedEnabled} onReport={() => setReport(true)} />
      {report && <ReportModal onClose={() => setReport(false)} />}
    </>
  );
}
