"use client";

import { useEffect } from "react";

export default function GiveButterWidget() {
  useEffect(() => {
    const existing = document.querySelector(
      'script[src="https://givebutter.com/js/widget.js"]'
    );
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://givebutter.com/js/widget.js";
      script.async = true;
      script.setAttribute("data-account", "LWq3rp");
      document.body.appendChild(script);
    }
  }, []);

  return (
    <div className="max-w-2xl mx-auto">
      <givebutter-widget id="LWq3rp" />
    </div>
  );
}
