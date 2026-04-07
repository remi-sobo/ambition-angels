import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
};

const boardMembers = [
  { name: "Remi Sobomehin", org: "Ambition Angels", title: "CEO", initials: "RS" },
  { name: "Jerrel Brown", org: "Dapper Down Lounge", title: "CEO", initials: "JB" },
  { name: "Lara Sellers", org: "", title: "Educational Advocate", initials: "LS" },
  { name: "Michelle Vilchez", org: "Innovate Public Schools", title: "CEO", initials: "MV" },
  { name: "Todd Singleton", org: "Microsoft", title: "General Manager", initials: "TS" },
];

const advisors = [
  { name: "Charles Best", org: "DonorsChoose", title: "Founder" },
  { name: "Meg Garlinghouse", org: "LinkedIn", title: "VP, Social Impact" },
  { name: "Shamar Edwards", org: "Alameda Unified", title: "Senior Director" },
  { name: "Lorne Needle", org: "X, the moonshot factory", title: "Head of People and Culture" },
  { name: "Jerrell Jimmerson", org: "Disney Streaming", title: "CPO" },
  { name: "Neil Bellefeuille", org: "BILD", title: "Partner" },
  { name: "Bob Burlinson", org: "Regis Management", title: "Co-Founder / Partner" },
  { name: "Lesley Martin", org: "Former Principal", title: "Education Consultant" },
  { name: "Sean Mendy", org: "Concrete Rose Capital", title: "Founding Partner" },
  { name: "Shawn Parr", org: "Envoy", title: "Managing Director" },
  { name: "Jeff Camarillo", org: "Stanford GSE", title: "STEP Director" },
  { name: "Preston Smith", org: "Rocketship Public Schools", title: "Co-Founder and CEO" },
  { name: "Jason Mayden", org: "The Speed of Grace", title: "Designer and Author" },
  { name: "Terri Givens", org: "McGill University", title: "Professor of Political Science" },
  { name: "Eugene Clark-Herrera", org: "Orrick LLP", title: "Partner" },
  { name: "Dr. Alan Schroeder", org: "Lucile Packard Children's Hospital Stanford", title: "Assoc. Chief for Research" },
  { name: "Heather Starnes-Logwood", org: "Live In Peace", title: "Executive Director" },
  { name: "Dr. Ryan Padrez", org: "Stanford School of Medicine", title: "Clinical Associate Professor in Pediatrics" },
  { name: "Mallory Dwinal-Palisch", org: "Reach University", title: "Chancellor" },
  { name: "Olatunde Sobomehin", org: "Streetcode Academy", title: "CEO" },
  { name: "Dr. Bryan Brown", org: "Stanford GSE", title: "Professor" },
  { name: "Julie Lythcott-Haims", org: "New York Times", title: "Bestselling Author of How to Raise an Adult" },
];

function getInitials(name: string): string {
  return name
    .replace(/^Dr\.\s+/, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function LinkedInIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
    </svg>
  );
}

export default function AboutPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative pt-32 pb-24 lg:pt-44 lg:pb-36 overflow-hidden bg-orange-light">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: "radial-gradient(circle, #E8500A 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="container-site relative z-10">
          <div className="max-w-3xl">
            <div className="inline-block text-xs font-medium text-orange bg-white border border-orange/20 px-4 py-1.5 rounded-full uppercase tracking-widest mb-6">
              About Us
            </div>
            <h1 className="font-heading font-bold text-4xl lg:text-6xl text-ink mb-6 leading-tight">
              Every teen deserves a clear picture of what is possible and a real path to get there.
            </h1>
            <p className="text-gray-warm text-lg lg:text-xl max-w-2xl leading-relaxed">
              Ambition Angels is a youth development organization building that path through technology, career exposure, and a deep belief in the potential of every student we serve.
            </p>
          </div>
        </div>
      </section>

      {/* OUR STORY */}
      <section className="section-pad">
        <div className="container-site">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div className="lg:sticky lg:top-32">
              <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
                Where We Came From
              </p>
              <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink leading-tight">
                This is not theory. This is our story.
              </h2>
            </div>
            <div className="space-y-5 text-gray-warm leading-relaxed text-base lg:text-lg">
              <p>
                Remi Sobomehin and Demetric Sanders grew up together in Portland, Oregon, both attending Remi&apos;s father&apos;s community nonprofit as kids. Despite growing up in low-income, inner-city communities with no roadmap, they set their sights on Stanford. Eight years later, with the support of dedicated youth developers and the organizations that showed up for them, they made it.
              </p>
              <p>
                After graduating, Remi went to East Palo Alto and got to work, leading in schools and nonprofits, trying to replicate what had worked for him and Demetric. He kept running into the same wall: he could not get teens to show up.
              </p>
              <p>
                Meanwhile, Demetric joined Facebook and worked on the product team focused on teens. He could see exactly who WAS reaching them at scale. Their phones.
              </p>
              <p>
                Only 11% of teens attend after-school programming. More than 95% own a smartphone and spend 8 hours a day on it. That is not a crisis to solve. That is the most powerful channel in the history of youth development. So they built for it.
              </p>
              <p>
                Ambition is what happens when you stop fighting where teens are and start meeting them there. That is our ambition.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOUNDER MESSAGE */}
      <section className="section-pad bg-ink">
        <div className="container-site">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-6">
              From Our Founder
            </p>
            <h2 className="font-heading font-bold text-3xl lg:text-4xl text-cream mb-8">
              This is personal.
            </h2>
            <blockquote className="text-gray-mid text-lg lg:text-xl leading-relaxed mb-8">
              &ldquo;My parents dedicated their lives to serving communities that had been left behind. That shaped everything about how I approach this work. I believe in the power of youth development to create a ripple effect for good. Every individual has massive potential and power. When teens are set on a pathway to an economically empowered future, we all benefit. Demetric and I are proof of what is possible when the right support shows up at the right time. Now we build technology to make sure that support reaches every teen who is ready for it. Together, let us keep investing in the future of our youth.&rdquo;
            </blockquote>
            <p className="text-gray-warm text-sm mb-8">
              Remi Sobomehin, Founder and CEO, Ambition Angels
            </p>
            <Link
              href="/founder"
              className="inline-block bg-orange hover:bg-orange-dark text-white font-semibold px-8 py-4 rounded-full transition-colors text-base"
            >
              Learn About Remi
            </Link>
          </div>
        </div>
      </section>

      {/* BOARD OF DIRECTORS */}
      <section className="section-pad">
        <div className="container-site">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              Our Board of Directors
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink mb-4">
              Five leaders. One shared mission.
            </h2>
            <p className="text-gray-warm leading-relaxed">
              Our board brings together diverse expertise and a deep commitment to the teens we serve.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {boardMembers.map((member) => (
              <div
                key={member.name}
                className="bg-white border border-gray-light rounded-card-lg p-7 shadow-sm flex flex-col"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-full bg-orange-light border-2 border-orange/20 flex items-center justify-center flex-shrink-0">
                    <span className="font-heading font-bold text-orange text-sm">
                      {member.initials}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-heading font-semibold text-ink text-base leading-tight">
                      {member.name}
                    </div>
                    {member.org && (
                      <div className="text-gray-warm text-sm truncate">{member.org}</div>
                    )}
                    <div className="text-gray-mid text-xs">{member.title}</div>
                  </div>
                </div>
                <div className="mt-auto pt-4 border-t border-gray-light">
                  <a
                    href="#"
                    aria-label={`${member.name} on LinkedIn`}
                    className="inline-flex items-center gap-1.5 text-gray-warm hover:text-orange transition-colors text-xs font-medium"
                  >
                    <LinkedInIcon />
                    LinkedIn
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ADVISORY BOARD */}
      <section className="section-pad bg-gray-light">
        <div className="container-site">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              Our Advisors
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink mb-4">
              22 leaders in education, tech, and social impact.
            </h2>
            <p className="text-gray-warm leading-relaxed">
              Our advisory board includes founders, executives, professors, and practitioners who bring real-world expertise and a genuine commitment to building opportunity for low-income youth.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {advisors.map((advisor) => (
              <div
                key={advisor.name}
                className="bg-white border border-gray-light rounded-card p-5 flex flex-col gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-light border border-orange/20 flex items-center justify-center flex-shrink-0">
                    <span className="font-heading font-bold text-orange text-xs">
                      {getInitials(advisor.name)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-heading font-semibold text-ink text-sm leading-tight">
                      {advisor.name}
                    </div>
                    <div className="text-gray-warm text-xs truncate">{advisor.org}</div>
                  </div>
                </div>
                <div className="text-gray-mid text-xs leading-snug">{advisor.title}</div>
                <div className="pt-2 border-t border-gray-light mt-auto">
                  <a
                    href="#"
                    aria-label={`${advisor.name} on LinkedIn`}
                    className="inline-flex items-center gap-1 text-gray-warm hover:text-orange transition-colors text-xs"
                  >
                    <LinkedInIcon />
                    LinkedIn
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
