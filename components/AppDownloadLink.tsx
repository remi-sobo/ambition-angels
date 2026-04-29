"use client";

import { trackEvent } from "@/lib/analytics";

const HREFS = {
  ios: "https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279",
  android: "https://play.google.com/store/apps/details?id=com.theambitionapp.ambitionappRN",
} as const;

type Platform = keyof typeof HREFS;

interface Props {
  platform: Platform;
  className?: string;
  children: React.ReactNode;
  href?: string; // override (e.g. when an existing link uses a campaign URL)
  ariaLabel?: string;
}

/**
 * Small client wrapper around an iOS / Android app-store link that fires
 * the corresponding analytics event on click. Use anywhere a download
 * link previously sat as a plain <a>.
 */
export default function AppDownloadLink({
  platform,
  className,
  children,
  href,
  ariaLabel,
}: Props) {
  const finalHref = href ?? HREFS[platform];
  return (
    <a
      href={finalHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        trackEvent(
          platform === "ios" ? "app_download_ios" : "app_download_android"
        )
      }
      className={className}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  );
}
