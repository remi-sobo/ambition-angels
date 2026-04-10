"use client";

import Script from "next/script";

export default function GiveButterEmbed() {
  return (
    <>
      {/* Element must be in the DOM BEFORE the script loads —
          GiveButter scans for existing <givebutter-widget> elements
          on script initialization, not via customElements.define */}
      <div className="w-full">
        <givebutter-widget id="LWq3rp"></givebutter-widget>
      </div>
      <Script
        src="https://givebutter.com/js/widget.js"
        strategy="afterInteractive"
      />
    </>
  );
}
