"use client";

import Script from "next/script";
import { useState } from "react";

export default function GiveButterEmbed() {
  const [ready, setReady] = useState(false);

  return (
    <>
      {/* Load GiveButter script exactly as they provide it — no extra attributes */}
      <Script
        src="https://givebutter.com/js/widget.js"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      {/* Only render the custom element after the script has loaded and
          registered the givebutter-widget custom element definition */}
      {ready && (
        <div className="w-full">
          <givebutter-widget id="LWq3rp"></givebutter-widget>
        </div>
      )}
    </>
  );
}
