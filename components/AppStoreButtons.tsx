"use client";

import { trackEvent } from "@/lib/analytics";

const IOS_URL =
  "https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279";
const ANDROID_URL =
  "https://play.google.com/store/apps/details?id=com.theambitionapp.ambitionappRN&pcampaignid=web_share";

function AppleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={`${className} flex-shrink-0`} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function PlayIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={`${className} flex-shrink-0`} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.18 23.76c.3.17.64.22.99.14l12.45-7.19-2.78-2.78-10.66 9.83zm-1.81-20.1c-.22.3-.35.7-.35 1.18v18.32c0 .48.13.88.36 1.18l.06.06 10.26-10.26v-.24L1.43 3.6l-.06.06zm20.43 8.83l-2.9-1.68-3.06 3.06 3.06 3.06 2.91-1.69c.83-.48.83-1.27-.01-1.75zM4.17.38L16.62 7.57l-2.78 2.78L3.18.52C3.5.35 3.86.28 4.17.38z" />
    </svg>
  );
}

type Variant = "lockup" | "pill";
type Theme = "dark" | "light";
type Size = "sm" | "md" | "lg";

type Props = {
  /** "lockup" = store-badge style (hero); "pill" = orange + ghost pair. */
  variant?: Variant;
  /** Background the buttons sit on — controls the ghost/secondary styling. */
  theme?: Theme;
  size?: Size;
  className?: string;
  /** Analytics source tag, e.g. "home_hero". */
  source?: string;
};

const SIZE: Record<Size, string> = {
  sm: "px-4 py-3 text-sm min-h-[44px]",
  md: "px-7 py-3.5 text-sm min-h-[44px]",
  lg: "px-5 py-3.5 text-base min-h-[52px]",
};

/**
 * The App Store / Google Play download pair. Replaces the markup that was
 * copy-pasted across the homepage, /the-app, /curriculum, and the footer.
 */
export default function AppStoreButtons({
  variant = "pill",
  theme = "dark",
  size = "md",
  className = "",
  source,
}: Props) {
  const track = (store: "ios" | "android") => () =>
    trackEvent("app_store_click", { store, source: source ?? "unknown" });

  if (variant === "lockup") {
    const badge =
      "inline-flex items-center gap-3 bg-cream text-ink font-semibold px-5 py-3.5 rounded-xl transition-all hover:bg-white hover:-translate-y-0.5 active:scale-95 min-h-[52px] shadow-lg";
    return (
      <div className={`flex flex-wrap gap-3 ${className}`}>
        <a href={IOS_URL} target="_blank" rel="noopener noreferrer" onClick={track("ios")} className={badge}>
          <AppleIcon className="w-6 h-6" />
          <span className="text-left leading-tight">
            <span className="block text-[10px] font-normal opacity-70">Download on the</span>
            <span className="block text-sm font-bold">App Store</span>
          </span>
        </a>
        <a href={ANDROID_URL} target="_blank" rel="noopener noreferrer" onClick={track("android")} className={badge}>
          <PlayIcon className="w-6 h-6" />
          <span className="text-left leading-tight">
            <span className="block text-[10px] font-normal opacity-70">Get it on</span>
            <span className="block text-sm font-bold">Google Play</span>
          </span>
        </a>
      </div>
    );
  }

  const primary = `inline-flex items-center gap-2 bg-orange hover:bg-orange-dark text-white font-semibold rounded-full transition-all hover:-translate-y-0.5 active:scale-95 shadow-lg shadow-orange/30 ${SIZE[size]}`;
  const ghost =
    theme === "dark"
      ? `inline-flex items-center gap-2 bg-cream/10 hover:bg-cream/20 text-cream border border-cream/20 font-semibold rounded-full transition-all hover:-translate-y-0.5 active:scale-95 ${SIZE[size]}`
      : `inline-flex items-center gap-2 bg-ink/[0.06] hover:bg-ink/[0.12] text-ink border border-ink/15 font-semibold rounded-full transition-all hover:-translate-y-0.5 active:scale-95 ${SIZE[size]}`;

  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      <a href={IOS_URL} target="_blank" rel="noopener noreferrer" onClick={track("ios")} className={primary}>
        <AppleIcon className="w-4 h-4" />
        Download for iOS
      </a>
      <a href={ANDROID_URL} target="_blank" rel="noopener noreferrer" onClick={track("android")} className={ghost}>
        <PlayIcon className="w-4 h-4" />
        Download for Android
      </a>
    </div>
  );
}
