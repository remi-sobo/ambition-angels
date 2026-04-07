import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { internships, getInternshipBySlug } from "@/lib/internships";

type Props = {
  params: { slug: string };
};

export async function generateStaticParams() {
  return internships.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const internship = getInternshipBySlug(params.slug);
  if (!internship) return { title: "Not Found" };
  return {
    title: `${internship.title} Internship`,
    description: internship.description,
  };
}

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

export default function InternshipDetailPage({ params }: Props) {
  const internship = getInternshipBySlug(params.slug);
  if (!internship) notFound();

  const otherInternships = internships
    .filter((i) => i.slug !== internship.slug)
    .slice(0, 3);

  return (
    <>
      {/* BREADCRUMB + HERO */}
      <section className="section-pad bg-ink">
        <div className="container-site">
          <div className="mb-8">
            <Link
              href="/curriculum"
              className="text-gray-mid text-sm hover:text-cream transition-colors inline-flex items-center gap-1.5"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              All Internships
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="flex items-center gap-3 mb-5">
                <span className={`text-xs font-medium px-3 py-1 rounded-full ${tagStyle(internship.category)}`}>
                  {internship.category}
                </span>
                <span className="text-xs text-gray-mid bg-cream/10 border border-cream/10 px-3 py-1 rounded-full">
                  {internship.duration}
                </span>
              </div>

              <h1 className="font-heading font-bold text-5xl lg:text-6xl text-cream mb-6 leading-none">
                {internship.title}
              </h1>

              <p className="text-gray-mid text-lg leading-relaxed mb-8 max-w-xl">
                {internship.longDescription}
              </p>

              <div className="flex flex-wrap gap-4">
                <Link
                  href="https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-orange hover:bg-orange-dark text-white font-semibold px-7 py-3.5 rounded-full transition-colors text-sm min-h-[44px] inline-flex items-center"
                >
                  Start This Internship
                </Link>
                <Link
                  href="/curriculum"
                  className="bg-cream/10 hover:bg-cream/20 text-cream font-semibold px-7 py-3.5 rounded-full transition-colors text-sm border border-cream/10 min-h-[44px] inline-flex items-center"
                >
                  Browse All Tracks
                </Link>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Duration", value: internship.duration },
                { label: "Daily commitment", value: "15 min / day" },
                { label: "Avg salary range", value: internship.salaryRange },
                { label: "Cost to students", value: "Free" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-cream/5 border border-cream/10 rounded-card p-5"
                >
                  <div className="text-xs text-gray-mid uppercase tracking-wider mb-2">
                    {item.label}
                  </div>
                  <div className="font-heading font-bold text-xl text-cream">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CONTENT GRID */}
      <section className="section-pad">
        <div className="container-site">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-16">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-12">
              {/* Day in the Life */}
              <div>
                <h2 className="font-heading font-bold text-2xl lg:text-3xl text-ink mb-6">
                  A day in this internship
                </h2>
                <div className="space-y-4">
                  {internship.dayInTheLife.map((item, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-light border border-orange/20 flex items-center justify-center mt-0.5">
                        <span className="font-heading font-bold text-orange text-xs">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <p className="text-charcoal leading-relaxed pt-1">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Why It Matters */}
              <div className="bg-orange-light border border-orange/10 rounded-card-lg p-8">
                <p className="text-xs font-medium text-orange uppercase tracking-widest mb-3">
                  Why It Matters
                </p>
                <p className="text-charcoal text-lg leading-relaxed">
                  {internship.whyItMatters}
                </p>
              </div>

              {/* Related Careers */}
              <div>
                <h2 className="font-heading font-bold text-2xl lg:text-3xl text-ink mb-6">
                  Where this takes you
                </h2>
                <div className="flex flex-wrap gap-3">
                  {internship.careers.map((career) => (
                    <span
                      key={career}
                      className="bg-white border border-gray-light text-charcoal text-sm font-medium px-4 py-2 rounded-full shadow-sm"
                    >
                      {career}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-8">
              {/* Skills */}
              <div className="bg-white border border-gray-light rounded-card-lg p-7 shadow-sm">
                <h3 className="font-heading font-semibold text-lg text-ink mb-5">
                  Skills you will build
                </h3>
                <ul className="space-y-3">
                  {internship.skills.map((skill) => (
                    <li key={skill} className="flex items-center gap-3 text-sm text-charcoal">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange flex-shrink-0" />
                      {skill}
                    </li>
                  ))}
                </ul>
              </div>

              {/* App CTA */}
              <div className="bg-ink rounded-card-lg p-7">
                <h3 className="font-heading font-bold text-lg text-cream mb-3">
                  Ready to start?
                </h3>
                <p className="text-gray-mid text-sm leading-relaxed mb-6">
                  Download the Ambition app and start this internship today. Free
                  for every student.
                </p>
                <div className="flex flex-col gap-2">
                  <a
                    href="https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-orange hover:bg-orange-dark text-white font-semibold px-5 py-3 rounded-xl transition-colors text-sm"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                    </svg>
                    Download for iOS
                  </a>
                  <a
                    href="https://play.google.com/store/apps/details?id=com.theambitionapp.ambitionappRN&pcampaignid=web_share"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-cream/10 hover:bg-cream/20 text-cream font-semibold px-5 py-3 rounded-xl transition-colors text-sm border border-cream/10"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3.18 23.76c.3.17.64.22.99.14l12.45-7.19-2.78-2.78-10.66 9.83zm-1.81-20.1c-.22.3-.35.7-.35 1.18v18.32c0 .48.13.88.36 1.18l.06.06 10.26-10.26v-.24L1.43 3.6l-.06.06zm20.43 8.83l-2.9-1.68-3.06 3.06 3.06 3.06 2.91-1.69c.83-.48.83-1.27-.01-1.75zM4.17.38L16.62 7.57l-2.78 2.78L3.18.52C3.5.35 3.86.28 4.17.38z" />
                    </svg>
                    Download for Android
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MORE INTERNSHIPS */}
      <section className="section-pad bg-gray-light border-t border-gray-mid/20">
        <div className="container-site">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-heading font-bold text-2xl lg:text-3xl text-ink">
              Explore more internships
            </h2>
            <Link
              href="/curriculum"
              className="text-orange font-medium text-sm hover:text-orange-dark transition-colors hidden lg:block"
            >
              See all &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {otherInternships.map((item) => (
              <Link
                key={item.slug}
                href={`/curriculum/${item.slug}`}
                className="group bg-white border border-gray-light rounded-card-lg p-6 shadow-sm hover:shadow-md hover:border-orange/30 transition-all"
              >
                <h3 className="font-heading font-bold text-lg text-ink mb-2 group-hover:text-orange transition-colors">
                  {item.title}
                </h3>
                <p className="text-gray-warm text-sm leading-relaxed mb-4 line-clamp-2">
                  {item.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-mid">{item.salaryRange}</span>
                  <span className="text-orange text-sm font-medium">Explore &rarr;</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-8 lg:hidden text-center">
            <Link
              href="/curriculum"
              className="text-orange font-medium text-sm hover:text-orange-dark transition-colors"
            >
              See all internships &rarr;
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
