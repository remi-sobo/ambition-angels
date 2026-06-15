import type { Metadata } from "next";
import Image from "next/image";
import AppStoreButtons from "@/components/AppStoreButtons";
import { MESA } from "@/lib/mesa";

export const metadata: Metadata = {
  title: "Get Paid to Explore Careers | MESA",
  description: `Explore real careers on your phone and earn a ${MESA.rewardPerInternship} gift card every time you finish an internship. Free for MESA students at ${MESA.collegeName}.`,
};

const dotTexture = {
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

export default function MesaStudentsPage() {
  return (
    <>
      {/* ── HERO — mobile-first ──────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden bg-ink"
        style={dotTexture}
      >
        {/* Doodle accent */}
        <Image
          src="/images/doodles/Doodle 70@3x.png"
          alt=""
          width={200}
          height={150}
          className="absolute top-24 right-0 opacity-15 pointer-events-none"
          aria-hidden="true"
        />

        <div className="container-site relative z-10 pt-28 pb-16 sm:pt-32 sm:pb-20">
          {/* Co-brand lockup */}
          <div className="flex items-center gap-3 mb-7 fade-up">
            <span className="inline-flex items-center bg-cream rounded-lg px-2.5 py-1.5">
              <Image
                src={MESA.logo.src}
                alt={MESA.logo.alt}
                width={MESA.logo.width}
                height={MESA.logo.height}
                className="h-6 w-auto"
                priority
              />
            </span>
            <span className="text-gray-mid text-base font-light" aria-hidden="true">
              ✕
            </span>
            <span className="font-heading font-bold text-cream text-sm tracking-tight">
              Ambition Angels
            </span>
          </div>

          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4 fade-up stagger-1">
            MESA x Ambition Angels
          </p>

          <h1 className="font-display font-black text-5xl sm:text-6xl text-cream leading-[0.95] tracking-tight uppercase mb-5 fade-up stagger-2">
            Get paid to <span className="text-orange">figure out your future.</span>
          </h1>

          <p className="text-gray-mid text-lg leading-relaxed mb-8 max-w-xl fade-up stagger-3">
            Explore real careers on your phone. Earn a {MESA.rewardPerInternship}{" "}
            gift card every time you finish an internship. Built for MESA
            students at {MESA.collegeName}.
          </p>

          <div className="fade-up stagger-4">
            <AppStoreButtons variant="lockup" source="mesa_students_hero" />
            <p className="text-gray-mid/70 text-sm font-semibold mt-4">
              Free. Always. No catch.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
