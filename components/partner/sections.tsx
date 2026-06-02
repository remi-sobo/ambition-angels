import Image from "next/image";
import type { ReactNode } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   Shared partner-page section library.

   Both /companies (the general front door) and /twilio (the same page
   personalized for one company) are built out of these blocks so the two
   pages stay visually and structurally in sync. Styling mirrors the rest of
   the site: dot-texture ink sections, orange eyebrow labels, the 01/02/03
   numbered pattern, and the home-page stat row.
   ────────────────────────────────────────────────────────────────────────── */

export const dotTexture = {
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

type Tone = "dark" | "light";

/* ── Section wrapper ─────────────────────────────────────────────────────── */
export function PartnerSection({
  tone = "dark",
  id,
  children,
  className = "",
}: {
  tone?: Tone;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <section
      id={id}
      className={`section-pad relative overflow-hidden ${
        dark ? "bg-ink" : "bg-[#F5F4F0]"
      } ${className}`}
      style={dark ? dotTexture : undefined}
    >
      <div className="container-site relative z-10">{children}</div>
    </section>
  );
}

/* ── Eyebrow + H2 (+ optional body) ──────────────────────────────────────── */
export function SectionHeader({
  eyebrow,
  title,
  body,
  tone = "dark",
  className = "",
}: {
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <div className={`max-w-3xl ${className}`}>
      <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
        {eyebrow}
      </p>
      <h2
        className={`font-heading font-bold text-4xl lg:text-5xl tracking-tight leading-tight ${
          dark ? "text-cream" : "text-ink"
        } ${body ? "mb-6" : ""}`}
      >
        {title}
      </h2>
      {body && (
        <p
          className={`text-lg leading-relaxed ${
            dark ? "text-gray-mid" : "text-gray-warm"
          }`}
        >
          {body}
        </p>
      )}
    </div>
  );
}

/* ── Hero ────────────────────────────────────────────────────────────────── */
export type HeroButton = {
  label: string;
  href: string;
};

export function PartnerHero({
  eyebrow,
  title,
  subhead,
  buttons,
  logoSlot,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  subhead: ReactNode;
  buttons: HeroButton[];
  /** Optional co-brand lockup shown above the eyebrow (e.g. Twilio + AA). */
  logoSlot?: ReactNode;
  /** Optional right-column visual (e.g. the iPhone mockup). */
  aside?: ReactNode;
}) {
  return (
    <section className="bg-ink section-pad relative overflow-hidden" style={dotTexture}>
      {/* Staircase-arrow doodle, same accent used on the home hero */}
      <Image
        src="/images/doodles/Doodle 62@3x.png"
        alt=""
        width={120}
        height={120}
        className="absolute top-8 right-8 opacity-20 -rotate-12 hidden sm:block"
        aria-hidden="true"
      />
      <div className="container-site relative z-10">
        <div
          className={`grid grid-cols-1 gap-12 lg:gap-16 items-center ${
            aside ? "lg:grid-cols-2" : ""
          }`}
        >
          <div className="pt-2 lg:pt-4">
            {logoSlot && <div className="mb-8">{logoSlot}</div>}
            <div className="inline-block text-xs font-bold text-orange bg-orange/10 border border-orange/30 px-4 py-1.5 rounded-full uppercase tracking-widest mb-6">
              {eyebrow}
            </div>
            <h1 className="font-display font-black text-5xl lg:text-6xl xl:text-7xl text-cream mb-6 leading-none tracking-tight uppercase">
              {title}
            </h1>
            <p className="text-gray-mid text-lg leading-relaxed mb-10 max-w-lg">
              {subhead}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              {buttons.map((b, i) => (
                <a
                  key={b.label}
                  href={b.href}
                  className={
                    i === 0
                      ? "bg-orange hover:bg-orange-dark text-white font-semibold px-8 py-4 rounded-full transition-colors text-base min-h-[52px] inline-flex items-center justify-center"
                      : "bg-cream/5 hover:bg-cream/10 text-cream border border-cream/20 font-semibold px-8 py-4 rounded-full transition-colors text-base min-h-[52px] inline-flex items-center justify-center"
                  }
                >
                  {b.label}
                </a>
              ))}
            </div>
          </div>

          {aside && <div className="flex justify-center lg:justify-end">{aside}</div>}
        </div>
      </div>
    </section>
  );
}

/* ── Stat row (identical proof block on both pages) ──────────────────────── */
export function StatRow() {
  return (
    <section
      className="bg-ink py-12 lg:py-16 relative overflow-hidden border-t border-cream/5"
      style={dotTexture}
    >
      <div className="container-site relative z-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="text-center">
            <div className="font-display font-black text-5xl lg:text-6xl text-orange mb-1 tracking-tight">
              3,500+
            </div>
            <div className="text-gray-mid text-sm">Teens reached</div>
          </div>
          <div className="text-center">
            <div className="font-display font-black text-5xl lg:text-6xl text-orange mb-1 tracking-tight">
              87%
            </div>
            <div className="text-gray-mid text-sm">From Title I schools</div>
          </div>
          {/* 14% — dashed-oval doodle centered on the number, as on the home page */}
          <div className="text-center relative">
            <Image
              src="/images/doodles/Doodle 70@3x.png"
              alt=""
              width={220}
              height={160}
              className="opacity-20 absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4 pointer-events-none"
              aria-hidden="true"
            />
            <div className="font-display font-black text-5xl lg:text-6xl text-orange mb-1 tracking-tight relative z-10">
              14%
            </div>
            <div className="text-gray-mid text-sm relative z-10">
              Increase in future orientation
            </div>
            <div className="text-gray-mid/60 text-xs relative z-10 mt-1 leading-snug max-w-[160px] mx-auto">
              A teen&apos;s belief that their future is worth working toward
            </div>
          </div>
          <div className="text-center">
            <div className="font-display font-black text-5xl lg:text-6xl text-orange mb-1 tracking-tight">
              1,100+
            </div>
            <div className="text-gray-mid text-sm">
              Hours of career exploration delivered
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 01 / 02 / 03 numbered blocks ────────────────────────────────────────── */
export type Step = {
  title: string;
  body: ReactNode;
  /** Optional small labeled lines under the body (e.g. Time / What teens get). */
  meta?: { label: string; value: string }[];
};

export function NumberedSteps({ steps }: { steps: Step[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {steps.map((step, i) => (
        <div
          key={step.title}
          className="bg-cream/5 border border-cream/10 rounded-card-lg p-7 flex flex-col hover:bg-cream/10 transition-colors"
        >
          <div className="font-display font-black text-6xl lg:text-7xl text-orange/30 leading-none mb-5 tracking-tight">
            {String(i + 1).padStart(2, "0")}
          </div>
          <h3 className="font-heading font-bold text-cream text-xl mb-3 tracking-tight">
            {step.title}
          </h3>
          <p className="text-gray-mid text-sm leading-relaxed flex-1">{step.body}</p>
          {step.meta && step.meta.length > 0 && (
            <dl className="mt-6 pt-5 border-t border-cream/10 space-y-2.5">
              {step.meta.map((m) => (
                <div key={m.label}>
                  <dt className="text-[11px] font-heading font-bold text-orange uppercase tracking-widest mb-0.5">
                    {m.label}
                  </dt>
                  <dd className="text-gray-mid text-sm leading-snug">{m.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Sponsorship: two-ways-to-partner cards ──────────────────────────────── */
export type SponsorshipLine = {
  label: string;
  /** Rendered in the muted price slot. Use [SET PRICE]-style placeholders. */
  price?: string;
};

export type SponsorshipCardData = {
  badge: string;
  title: string;
  body: ReactNode;
  lines: SponsorshipLine[];
  /** Optional small note shown beneath the line list. */
  footnote?: ReactNode;
};

export function SponsorshipCards({
  cards,
  note,
}: {
  cards: [SponsorshipCardData, SponsorshipCardData];
  note?: ReactNode;
}) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {cards.map((card) => (
          <div
            key={card.title}
            className="bg-cream/5 border border-cream/10 border-t-[3px] border-t-orange rounded-card-lg p-8 flex flex-col"
          >
            <div className="inline-block text-xs font-bold text-orange bg-orange/15 border border-orange/30 px-3 py-1 rounded-full uppercase tracking-widest mb-5 self-start">
              {card.badge}
            </div>
            <h3 className="font-heading font-bold text-cream text-2xl mb-4 tracking-tight">
              {card.title}
            </h3>
            <p className="text-gray-mid text-sm leading-relaxed mb-6">{card.body}</p>
            <ul className="space-y-3 flex-1">
              {card.lines.map((line) => (
                <li
                  key={line.label}
                  className="flex items-baseline justify-between gap-4 border-b border-cream/10 pb-3 last:border-0"
                >
                  <span className="text-cream text-sm leading-snug">{line.label}</span>
                  {line.price && (
                    <span className="font-heading font-semibold text-orange text-sm whitespace-nowrap text-right">
                      {line.price}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {card.footnote && (
              <p className="text-gray-mid/70 text-xs leading-relaxed mt-5">
                {card.footnote}
              </p>
            )}
          </div>
        ))}
      </div>
      {note && (
        <p className="text-gray-mid text-sm leading-relaxed mt-8 max-w-2xl">{note}</p>
      )}
    </>
  );
}

/* ── Closing CTA ─────────────────────────────────────────────────────────── */
export function ClosingCTA({
  title,
  body,
  buttonLabel,
  buttonHref,
  children,
}: {
  title: ReactNode;
  body?: ReactNode;
  /** Optional pill button. Omit when the form below is the booking mechanism. */
  buttonLabel?: string;
  buttonHref?: string;
  /** Optional extra content (e.g. the contact form) shown above the email link. */
  children?: ReactNode;
}) {
  return (
    <section
      id="contact"
      className="section-pad bg-ink relative overflow-hidden"
      style={dotTexture}
    >
      <div className="container-site relative z-10 max-w-2xl text-center">
        <h2 className="font-display font-black text-5xl lg:text-6xl text-cream uppercase tracking-tight leading-none mb-5">
          {title}
        </h2>
        {body && (
          <p className="text-gray-mid text-lg leading-relaxed mb-10">{body}</p>
        )}
        {children}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center items-center">
          {buttonLabel && buttonHref && (
            <a
              href={buttonHref}
              className="bg-orange hover:bg-orange-dark text-white font-semibold px-8 py-4 rounded-full transition-colors text-base min-h-[52px] inline-flex items-center justify-center"
            >
              {buttonLabel}
            </a>
          )}
          <a
            href="mailto:hello@ambitionangels.org"
            className="text-cream underline underline-offset-2 hover:text-gray-mid transition-colors text-base"
          >
            hello@ambitionangels.org
          </a>
        </div>
      </div>
    </section>
  );
}

/* ── Short framing / single-paragraph block ──────────────────────────────── */
export function FramingBlock({
  tone = "light",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  const dark = tone === "dark";
  return (
    <PartnerSection tone={tone} className="!py-14 lg:!py-16">
      <p
        className={`text-lg lg:text-xl leading-relaxed max-w-3xl ${
          dark ? "text-gray-mid" : "text-gray-warm"
        }`}
      >
        {children}
      </p>
    </PartnerSection>
  );
}
