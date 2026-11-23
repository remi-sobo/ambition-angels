"use client";

import TwoStepFrame from "@/app/admin/_components/twoStep/TwoStepFrame";
import TwoStepEnroll from "@/app/admin/_components/twoStep/TwoStepEnroll";

export default function EnrollScreen({ next }: { next: string }) {
  return (
    <TwoStepFrame
      title="Set up two-step login"
      intro={
        <>
          BloomOS asks everyone for a second step when they sign in: a code from an authenticator app on your phone.
          It takes about a minute, once.
        </>
      }
      footer="Lose your phone later? An owner or admin of your organization can reset this for you."
    >
      {/* A full navigation, so middleware sees the new aal2 session cookies. */}
      <TwoStepEnroll friendlyName="Authenticator app" onDone={() => window.location.assign(next)} />
    </TwoStepFrame>
  );
}
