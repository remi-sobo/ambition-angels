"use client";

import { useEffect } from "react";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { syncNow } from "@/lib/admin/program/attendanceSync";

/**
 * Sends attendance marks left on this device (V4 Stage E). If someone took
 * roll offline and closed the page, their marks stayed in the queue; the next
 * time BloomOS opens online, or the connection comes back on any screen, this
 * sends them and says so. Renders nothing. Mounted in the admin shell for
 * roles that can take attendance (program.write).
 */
export default function AttendanceSync() {
  const toast = useToast();
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const r = await syncNow();
      if (!alive) return;
      if (r.sent > 0) toast.success(`${r.sent} attendance mark${r.sent === 1 ? "" : "s"} from this device saved.`);
      if (r.rejected > 0) {
        toast.error(`${r.rejected} attendance mark${r.rejected === 1 ? "" : "s"} could not be saved and were removed from this device.`);
      }
    };
    void run();
    window.addEventListener("online", run);
    return () => {
      alive = false;
      window.removeEventListener("online", run);
    };
  }, [toast]);
  return null;
}
