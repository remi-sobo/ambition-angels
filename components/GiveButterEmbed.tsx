"use client";

// The GiveButter script is loaded in app/layout.tsx (afterInteractive, end of body).
// This element appears in the SSR HTML before that script tag, which is the
// order GiveButter requires to initialize correctly.
export default function GiveButterEmbed() {
  return (
    <div className="w-full">
      <givebutter-widget id="LWq3rp"></givebutter-widget>
    </div>
  );
}
