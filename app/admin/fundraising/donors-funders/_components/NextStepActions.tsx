"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import NextStepBar from "@/app/admin/_components/ui/NextStepBar";
import Button from "@/app/admin/_components/ui/Button";
import Modal from "@/app/admin/_components/ui/Modal";
import { TextField, DateField } from "@/app/admin/_components/ui/Field";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";

/**
 * The donor record's next-step bar (V4 B1, Donor.dc.html), driven by the
 * soonest-due open ask's next step (the same "next move" the record always
 * showed). Mark done, Reschedule and Change all PATCH that ask through
 * saveAction, then the page re-reads. No optimistic update: the bar changes
 * when the server says yes, and a failure says so in a toast.
 */
export default function NextStepActions({
  oppId,
  title,
  due,
  dueISO,
  meta,
  today,
  emptyAction,
}: {
  /** The ask the step belongs to; null when the donor has no open ask. */
  oppId: string | null;
  title: string | null;
  due?: { text: string; late?: boolean };
  dueISO: string | null;
  meta?: ReactNode;
  today: string;
  /** What to offer when there is no open ask at all (a link to Pipeline). */
  emptyAction?: ReactNode;
}) {
  const router = useRouter();
  const save = useSaveAction();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | "reschedule" | "change">(null);
  const [step, setStep] = useState(title?.replace(/\.$/, "") ?? "");
  const [date, setDate] = useState(dueISO ?? today);

  async function patch(body: Record<string, unknown>, success: string) {
    if (!oppId || busy) return false;
    setBusy(true);
    const r = await save({ request: { url: `/api/admin/opportunities/${oppId}`, method: "PATCH", body }, success });
    setBusy(false);
    if (r.ok) {
      setDialog(null);
      router.refresh();
    }
    return r.ok;
  }

  const open = (d: "reschedule" | "change") => {
    setStep(title?.replace(/\.$/, "") ?? "");
    setDate(dueISO ?? today);
    setDialog(d);
  };

  const actions: [ReactNode] | [ReactNode, ReactNode] | [ReactNode, ReactNode, ReactNode] | undefined = !oppId
    ? emptyAction
      ? [emptyAction]
      : undefined
    : title
      ? [
          <Button key="done" variant="strong" size="lg" loading={busy && dialog === null} disabled={busy} onClick={() => patch({ next_step: null, next_step_due: null }, "Next step done")}>
            Mark done
          </Button>,
          <Button key="res" variant="secondary" size="lg" disabled={busy} onClick={() => open("reschedule")}>
            Reschedule
          </Button>,
          <Button key="chg" variant="secondary" size="lg" disabled={busy} onClick={() => open("change")}>
            Change
          </Button>,
        ]
      : [
          <Button key="add" variant="strong" size="lg" disabled={busy} onClick={() => open("change")}>
            Add a next step
          </Button>,
        ];

  return (
    <>
      <NextStepBar title={title} due={due} meta={meta} actions={actions} />
      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        size="sm"
        title={dialog === "reschedule" ? "Reschedule the next step" : title ? "Change the next step" : "Add a next step"}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="lg"
              variant="strong"
              loading={busy}
              disabled={busy || (dialog === "change" && !step.trim())}
              onClick={() =>
                dialog === "reschedule"
                  ? patch({ next_step_due: date || null }, "Next step rescheduled")
                  : patch({ next_step: step.trim(), next_step_due: date || null }, "Next step saved")
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {dialog === "change" ? (
            <TextField label="Next step" required value={step} onChange={(e) => setStep(e.target.value)} placeholder="Send year-end ask" autoFocus />
          ) : null}
          <DateField label="Due" value={date} onChange={(e) => setDate(e.target.value)} hint={date === today ? "Today" : undefined} />
        </div>
      </Modal>
    </>
  );
}
