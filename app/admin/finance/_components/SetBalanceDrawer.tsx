"use client";

import { useRouter } from "next/navigation";
import Drawer from "@/app/admin/_components/ui/Drawer";
import SetBalanceForm from "./SetBalanceForm";

/** "Set current balance" in the kit Drawer (V4 Stage G2). */
export default function SetBalanceDrawer({
  open,
  onClose,
  computedCash,
  anchorDate,
}: {
  open: boolean;
  onClose: () => void;
  computedCash: number | null;
  anchorDate: string | null;
}) {
  const router = useRouter();
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Set current balance"
      description="Anchor cash on hand to the real number from your bank."
    >
      <SetBalanceForm
        computedCash={computedCash}
        anchorDate={anchorDate}
        onCancel={onClose}
        onSaved={() => {
          onClose();
          router.refresh();
        }}
      />
    </Drawer>
  );
}
