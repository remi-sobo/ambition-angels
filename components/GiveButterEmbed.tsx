"use client";

import { useEffect, useRef } from "react";

export default function GiveButterEmbed() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const mount = () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = "";
      const el = document.createElement("givebutter-widget") as HTMLElement;
      el.setAttribute("id", "LWq3rp");
      containerRef.current.appendChild(el);
    };

    // If script already loaded and custom element is defined, mount immediately
    if (customElements.get("givebutter-widget")) {
      mount();
      return;
    }

    // Otherwise inject the script and mount once it fires
    const existing = document.querySelector(
      'script[src="https://givebutter.com/js/widget.js"]'
    );

    if (existing) {
      // Script tag exists but element not yet defined — wait for it
      customElements.whenDefined("givebutter-widget").then(mount);
    } else {
      const script = document.createElement("script");
      script.src = "https://givebutter.com/js/widget.js";
      script.setAttribute("data-account", "LWq3rp");
      script.async = true;
      script.onload = mount;
      document.head.appendChild(script);
    }

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ minHeight: 520 }}
    />
  );
}
