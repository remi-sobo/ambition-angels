"use client";

import { useState } from "react";
import Drawer from "@/app/admin/_components/ui/Drawer";
import Button from "@/app/admin/_components/ui/Button";
import AckComposer, { type AckTemplateLite } from "./AckComposer";
import { type AckChannel } from "@/lib/fundraising/ack-channels";

/**
 * The Thank-yous list's next-step action (V4 B1): "Send thank-you" when the
 * donor has an email, "Mark thanked" when not. Either opens the existing
 * composer in the one Drawer. Sending stays the composer's explicit, reviewed
 * Send button: nothing here sends on its own.
 */
export default function ThankYouButton({
  mode,
  giftId,
  donorName,
  donorEmail,
  complianceBlock,
  templates,
  defaultChannel,
  orgName,
  giftLine,
}: {
  mode: "send" | "mark";
  giftId: string;
  donorName: string;
  donorEmail: string | null;
  complianceBlock: string;
  templates: AckTemplateLite[];
  defaultChannel: AckChannel | null;
  orgName: string;
  /** "$250 gift on Nov 3" for the drawer's description. */
  giftLine: string;
}) {
  const [open, setOpen] = useState(false);
  // Send opens on email; Mark opens on the donor's offline preference, else
  // a letter. The person can switch channel in the composer either way.
  const channel: AckChannel =
    mode === "send" ? "email" : defaultChannel && defaultChannel !== "email" ? defaultChannel : "letter";
  return (
    <>
      <Button type="button" variant={mode === "send" ? "strong" : "secondary"} size="sm" onClick={() => setOpen(true)}>
        {mode === "send" ? "Send thank-you" : "Mark thanked"}
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} title={`Thank ${donorName}`} description={giftLine} width={560}>
        {open ? (
          <AckComposer
            startOpen
            onDone={() => setOpen(false)}
            giftId={giftId}
            donorName={donorName}
            donorEmail={donorEmail}
            complianceBlock={complianceBlock}
            templates={templates}
            defaultChannel={channel}
            orgName={orgName}
          />
        ) : null}
      </Drawer>
    </>
  );
}
