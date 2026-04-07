import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Our Founder",
};

export default function FounderPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative pt-32 pb-24 lg:pt-44 lg:pb-36 bg-orange-light overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: "radial-gradient(circle, #E8500A 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="container-site relative z-10">
          <div className="flex flex-col items-center text-center">
            <div className="w-32 h-32 lg:w-44 lg:h-44 rounded-full bg-white border-4 border-orange flex items-center justify-center mb-8 shadow-lg">
              <span className="font-heading font-bold text-orange text-4xl lg:text-5xl">RS</span>
            </div>
            <h1 className="font-heading font-bold text-4xl lg:text-6xl text-ink mb-3">
              Remi Sobomehin
            </h1>
            <p className="text-gray-warm text-lg lg:text-xl">
              Founder and CEO, Ambition Angels
            </p>
          </div>
        </div>
      </section>

      {/* BIO */}
      <section className="section-pad">
        <div className="container-site">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            {/* Photo placeholder */}
            <div className="lg:sticky lg:top-32">
              <div className="w-full aspect-square max-w-sm mx-auto lg:mx-0 rounded-card-lg bg-orange-light border-2 border-orange/20 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 rounded-full bg-white border-2 border-orange/30 flex items-center justify-center mx-auto mb-4">
                    <span className="font-heading font-bold text-orange text-2xl">RS</span>
                  </div>
                  <p className="text-gray-mid text-sm">Photo coming soon</p>
                </div>
              </div>
            </div>

            {/* Text */}
            <div>
              <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
                The Story
              </p>
              <div className="space-y-5 text-gray-warm leading-relaxed text-base lg:text-lg">
                <p>
                  Born into a family dedicated to social justice and community service, Remi inherited a passion for youth development from his parents in Portland, Oregon. Their nonprofit work instilled in him a deep commitment to showing up for young people who had not had enough people in their corner.
                </p>
                <p>
                  That desire to understand and address the barriers facing Black youth led Remi to Stanford University, where he sought to uncover root causes and equip himself with the tools to create lasting change.
                </p>
                <p>
                  After graduating, he moved from Stanford to East Palo Alto and got directly to work, leading in schools and nonprofits, building relationships, and trying to replicate what had worked for him. Youth development is not just a profession for Remi. It is a way of life.
                </p>
                <p>
                  He sees boundless potential in young people and works to provide the resources and support they need to grow academically, professionally, and as full human beings.
                </p>
                <p>
                  That same holistic approach defines his personal life. Remi and his wife Kendra homeschool their two children in East Palo Alto, where they stay deeply rooted in the community he serves.
                </p>
                <p>
                  His vision is simple: every young person, regardless of where they start, should have the tools and support to reach their full potential. Through direct service, innovative technology, and a commitment to dismantling the barriers that create inequity, that is exactly what he is building.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* QUOTE BLOCK */}
      <section className="section-pad bg-orange">
        <div className="container-site">
          <div className="max-w-3xl mx-auto text-center">
            <svg
              className="w-10 h-10 text-white/40 mx-auto mb-6"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
            </svg>
            <blockquote className="font-heading font-semibold text-xl lg:text-2xl text-white leading-relaxed mb-8">
              My parents ran youth nonprofits throughout my childhood and instilled in me a dedication to serve communities that have been left behind. All of our youth deserve the highest quality investments, and when that reality comes to fruition, we all benefit.
            </blockquote>
            <p className="text-white/70 font-medium">Remi Sobomehin</p>
          </div>
        </div>
      </section>

      {/* BACK LINK */}
      <section className="py-12">
        <div className="container-site text-center">
          <Link
            href="/about"
            className="inline-flex items-center gap-2 text-orange font-medium hover:text-orange-dark transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to About
          </Link>
        </div>
      </section>
    </>
  );
}
