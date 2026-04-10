"use client";

import { openDonateWidget } from "@/components/GiveButterWidget";

interface Props {
  className?: string;
  children?: React.ReactNode;
}

export default function DonateButton({ className, children }: Props) {
  return (
    <button onClick={openDonateWidget} className={className}>
      {children ?? "Donate Now"}
    </button>
  );
}
