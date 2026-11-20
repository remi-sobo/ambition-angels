import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghostDark" | "inverse";
type Size = "sm" | "md" | "lg";

/** Class string for a pill, so client components (DonateButton,
 *  AppDownloadLink) can wear the same button without wrapping it. */
export function pillClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return ["aa-pill", `aa-pill--${variant}`, size !== "md" ? `aa-pill--${size}` : "", extra]
    .filter(Boolean)
    .join(" ");
}

/** Fully rounded call to action. One primary pill per view. */
export default function PillCTA({
  children,
  variant = "primary",
  size = "md",
  href,
  style,
  className,
}: {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  href: string;
  style?: CSSProperties;
  className?: string;
}) {
  const cls = pillClass(variant, size, className);
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={cls} style={style}>
        {children}
      </Link>
    );
  }
  const external = /^https?:/.test(href);
  return (
    <a
      href={href}
      className={cls}
      style={style}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}
