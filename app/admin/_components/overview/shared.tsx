import Link from "next/link";
import type { ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

// Shared chrome for the overview widgets. Every CEO/Ops widget is a
// self-contained component that renders inside this <Widget> shell, so the two
// role views stay pure arrangements of widgets rather than monoliths.

export function Widget({
  title,
  href,
  hrefLabel,
  children,
  className,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden ${className ?? ""}`}>
      <div className="px-5 py-4 border-b border-outline flex items-center justify-between gap-3">
        <h2 className={TYPE.cardTitle}>{title}</h2>
        {href && (
          <Link href={href} className="text-xs font-semibold text-orange hover:text-orange-mid transition-colors whitespace-nowrap">
            {hrefLabel ?? "View"} →
          </Link>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className={`${TYPE.bodyMuted}`}>{children}</p>
);

export const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 0)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
