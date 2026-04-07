import type { Metadata } from "next";
import Link from "next/link";
import { internships, categories } from "@/lib/internships";

export const metadata: Metadata = {
  title: "Internship Directory",
  description:
    "Explore 30-day simulated internships across business, technology, healthcare, finance, and more. Find the career path that fits you.",
};

const categoryColors: Record<string, string> = {
  Business: "bg-orange-light text-orange border border-orange/20",
  Technology: "bg-blue-50 text-blue-700 border border-blue-200",
  Healthcare: "bg-green-50 text-green-700 border border-green-200",
  Finance: "bg-amber-50 text-amber-700 border border-amber-200",
  "Skilled Trades": "bg-stone-100 text-stone-700 border border-stone-300",
  "Public Service": "bg-purple-50 text-purple-700 border border-purple-200",
  Creative: "bg-pink-50 text-pink-700 border border-pink-200",
};

const tagStyle = (category: string) =>
  categoryColors[category] ?? "bg-gray-light text-charcoal border border-gray-mid/30";

export default function CurriculumPage() {
  return (
    <>
      {/* HERO */}
      <section className="section-pad bg-ink">
        <div className="container-site">
          <div className="max-w-3xl">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              Internship Directory
            </p>
            <h1 className="font-heading font-bold text-5xl lg:text-6xl text-cream mb-6 leading-none">
              Find the career that fits how{" "}
              <span className="text-orange">you are built.</span>
            </h1>
            <p className="text-gray-mid text-lg lg:text-xl leading-relaxed max-w-2xl">
              Each internship is 30 days, 15 minutes a day, and designed to feel
              like the real thing. Pick one that sounds interesting. You might
              surprise yourself.
            </p>
          </div>

          {/* Category pills */}
          <div className="mt-10 flex flex-wrap gap-3">
            {categories.map((cat) => (
              <span
                key={cat}
                className="text-xs font-medium px-4 py-1.5 rounded-full border border-cream/20 text-gray-mid"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
      <section className="bg-orange py-8">
        <div className="container-site">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
            {[
              { number: "12", label: "Internship tracks" },
              { number: "30", label: "Days per internship" },
              { number: "15 min", label: "Per day commitment" },
              { number: "100%", label: "Free for every student" },
            ].map((item) => (
              <div key={item.label}>
                <div className="font-heading font-bold text-3xl lg:text-4xl text-white">
                  {item.number}
                </div>
                <div className="text-white/80 text-sm mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INTERNSHIP GRID */}
      <section className="section-pad">
        <div className="container-site">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {internships.map((internship) => (
              <Link
                key={internship.slug}
                href={`/curriculum/${internship.slug}`}
                className="group bg-white border border-gray-light rounded-card-lg p-7 shadow-sm hover:shadow-md hover:border-orange/30 transition-all flex flex-col"
              >
                <div className="flex items-start justify-between mb-4">
                  <span
                    className={`text-xs font-medium px-3 py-1 rounded-full ${tagStyle(internship.category)}`}
                  >
                    {internship.category}
                  </span>
                  <span className="text-xs text-gray-warm bg-gray-light px-3 py-1 rounded-full">
                    {internship.duration}
                  </span>
                </div>

                <h2 className="font-heading font-bold text-xl text-ink mb-3 group-hover:text-orange transition-colors">
                  {internship.title}
                </h2>

                <p className="text-gray-warm text-sm leading-relaxed flex-1 mb-5">
                  {internship.description}
                </p>

                <div className="flex items-center justify-between mt-auto">
                  <div>
                    <div className="text-xs text-gray-mid mb-0.5">Avg salary</div>
                    <div className="font-heading font-semibold text-ink text-sm">
                      {internship.salaryRange}
                    </div>
                  </div>
                  <span className="text-orange text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                    Explore
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-pad bg-orange-light border-t border-orange/10">
        <div className="container-site text-center">
          <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink mb-4">
            Not sure where to start?
          </h2>
          <p className="text-gray-warm text-lg mb-8 max-w-prose mx-auto leading-relaxed">
            Take our free career quiz and we will match you with the top 10
            careers that fit your strengths, interests, and goals. Takes about 5
            minutes.
          </p>
          <Link
            href="/"
            className="inline-block bg-orange hover:bg-orange-dark text-white font-semibold px-8 py-4 rounded-full transition-colors shadow-lg shadow-orange/20"
          >
            Take the Career Quiz
          </Link>
        </div>
      </section>
    </>
  );
}
