"use client";

import { useEffect, useRef } from "react";

export default function GiveButterEmbed() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Inject script first; only create the widget element after the script
    // has loaded and registered the custom element definition.
    const script = document.createElement("script");
    script.src = "https://givebutter.com/js/widget.js";
    script.async = true;

    script.onload = () => {
      const widget = document.createElement("givebutter-widget");
      widget.setAttribute("id", "LWq3rp");
      container.appendChild(widget);
    };

    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, []);

  return <div ref={containerRef} className="w-full min-h-[500px]" />;
}
