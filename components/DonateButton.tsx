"use client";

import { useDonateModal } from "@/components/DonateModalProvider";
import { trackEvent } from "@/lib/analytics";

interface Props {
  className?: string;
  children?: React.ReactNode;
}

export default function DonateButton({ className, children }: Props) {
  const { openModal } = useDonateModal();
  const handleClick = () => {
    // "Become an Angel" framed CTAs get a more specific second event
    const label = typeof children === "string" ? children : "";
    if (/angel/i.test(label)) {
      trackEvent("become_angel_clicked");
    }
    // openModal itself fires donate_button_clicked
    openModal();
  };
  return (
    <button onClick={handleClick} className={className}>
      {children ?? "Donate Now"}
    </button>
  );
}
