"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import DonateModal from "./DonateModal";
import { trackEvent } from "@/lib/analytics";

interface DonateModalContextType {
  openModal: () => void;
  closeModal: () => void;
}

const DonateModalContext = createContext<DonateModalContextType>({
  openModal: () => {},
  closeModal: () => {},
});

export function useDonateModal() {
  return useContext(DonateModalContext);
}

export default function DonateModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = useCallback(() => {
    // Single chokepoint for every donate trigger on the site
    trackEvent("donate_button_clicked");
    setIsOpen(true);
  }, []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  return (
    <DonateModalContext.Provider value={{ openModal, closeModal }}>
      {children}
      {isOpen && <DonateModal onClose={closeModal} />}
    </DonateModalContext.Provider>
  );
}
