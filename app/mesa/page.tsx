import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { MESA } from "@/lib/mesa";

export const metadata: Metadata = {
  title: "MESA Partnership",
  description: `A career-readiness partnership between Ambition Angels and MESA at ${MESA.collegeName}: real career exposure, a team that guides students, and a coach for the ones ready to go further.`,
};

const dotTexture = {
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

export default function MesaPage() {
  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        className="relative flex items-center overflow-hidden bg-ink min-h-[88vh]"
        style={dotTexture}
      >
        {/* Doodle accent — staircase upward arrow, low opacity */}
        <Image
          src="/images/doodles/Doodle 62@3x.png"
          alt=""
          width={140}
          height={140}
          className="absolute top-10 right-8 opacity-20 -rotate-12 hidden sm:block"
          aria-hidden="true"
        />

        <div className="container-site relative z-10 pt-32 pb-24 lg:pt-40 lg:pb-32">
          {/* Co-brand lockup */}
          <div className="flex items-center gap-4 mb-8 fade-up">
            <span className="font-heading font-bold text-cream text-base sm:text-lg tracking-tight">
              Ambition Angels
            </span>
            <span className="text-gray-mid text-xl font-light" aria-hidden="true">
              ✕
            </span>
            <span className="inline-flex items-center bg-cream rounded-xl px-3 py-2">
              <Image
                src={MESA.logo.src}
                alt={MESA.logo.alt}
                width={MESA.logo.width}
                height={MESA.logo.height}
                className="h-7 w-auto sm:h-8"
                priority
              />
            </span>
          </div>

          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-5 fade-up stagger-1">
            {MESA.lockup}
          </p>

          <h1 className="font-display font-black text-5xl sm:text-6xl lg:text-7xl text-cream leading-none tracking-tight uppercase mb-6 max-w-4xl fade-up stagger-2">
            A career-readiness partnership for MESA students.
          </h1>

          <p className="text-gray-mid text-lg leading-relaxed max-w-2xl mb-10 fade-up stagger-3">
            Ambition Angels and MESA at {MESA.collegeName} are piloting a full
            career pathway for {MESA.studentCount} students this year: real
            career exposure, a team that guides them, and a coach for the ones
            ready to go further.
          </p>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3 fade-up stagger-4">
            <Link
              href="/mesa/students"
              className="bg-orange hover:bg-orange-dark text-white font-semibold text-base px-8 py-4 rounded-full transition-colors min-h-[52px] inline-flex items-center justify-center"
            >
              See the student experience
            </Link>
            <a
              href={`mailto:${MESA.contactEmail}`}
              className="bg-cream/10 hover:bg-cream/20 text-cream border border-cream/20 font-semibold text-base px-8 py-4 rounded-full transition-colors min-h-[52px] inline-flex items-center justify-center"
            >
              Talk to us
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
