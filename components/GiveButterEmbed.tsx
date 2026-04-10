"use client";

// Script loads at end of <body> in layout.tsx as a native async tag.
// This element is SSR'd into the HTML before that script, so GiveButter
// finds it in the DOM when the script executes.
export default function GiveButterEmbed() {
  return (
    <div className="w-full">
      <givebutter-widget id="LWq3rp"></givebutter-widget>
    </div>
  );
}
