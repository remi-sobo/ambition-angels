import type { Metadata } from "next";
import Link from "next/link";
import CareerQuiz from "@/components/CareerQuiz";

export const metadata: Metadata = {
  title: "Your Top 10 · The Career Quiz",
  description:
    "15 questions, about 3 minutes. Get 10 careers matched to how you actually work, with real pay for where you live.",
};

// The teen-facing home of the career quiz (ages 14–18). The same quiz runs
// in a modal on the homepage and /curriculum with the adult picker on;
// here it's teen mode from the first tap.
export default function CareerQuizPage() {
  return (
    <>
      {/* HERO */}
      <section
        className="relative pt-32 pb-14 lg:pt-40 lg:pb-16 bg-ink overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
            Ages 14&ndash;18 &middot; About 3 minutes
          </p>
          <h1 className="font-display font-black text-5xl lg:text-7xl text-cream leading-none tracking-tight uppercase mb-5 max-w-3xl">
            Your top <span className="text-orange">10 careers.</span>
          </h1>
          <p className="text-gray-mid text-lg leading-relaxed max-w-xl">
            15 questions about how you actually work: what you&apos;re into, what people come to you for, what a good day looks like. You get 10 careers matched to you, with real pay for where you live.
          </p>
        </div>
      </section>

      {/* THE QUIZ */}
      <section className="section-pad bg-cream">
        <div className="container-site">
          <div className="max-w-2xl mx-auto">
            <CareerQuiz showAudiencePicker={false} defaultAudience="teen" source="career_quiz_page" />
          </div>
        </div>
      </section>

      {/* BACK TO THE HUB */}
      <section className="pb-16 lg:pb-20">
        <div className="container-site text-center">
          <Link
            href="/teens"
            className="text-orange font-medium text-sm hover:text-orange-dark transition-colors"
          >
            &larr; Back to games and quizzes
          </Link>
        </div>
      </section>
    </>
  );
}
