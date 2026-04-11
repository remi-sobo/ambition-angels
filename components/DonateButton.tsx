"use client";

import { useDonateModal } from "@/components/DonateModalProvider";

interface Props {
  className?: string;
  children?: React.ReactNode;
}

export default function DonateButton({ className, children }: Props) {
  const { openModal } = useDonateModal();
  return (
    <button onClick={openModal} className={className}>
      {children ?? "Donate Now"}
    </button>
  );
}
