import type { Metadata } from "next";
import Image from "next/image";
import AppStoreButtons from "@/components/AppStoreButtons";
import DashboardMockup from "@/components/DashboardMockup";
import SchoolsInquiryForm from "@/components/SchoolsInquiryForm";

export const metadata: Metadata = {
  title: "For Schools & Programs",
  description:
    "Career exposure for every student in the building, run by the adults already in the room. Chromebooks, fifteen minutes twice a week, one adult who owns it.",
};

const settings = [
  "High schools with advisory or homeroom",
  "Community colleges",
  "After-school and mentoring programs",
  "Juvenile justice programs",
  "Faith communities",
];

const adultFeatures = [
  "A live roster of every student and what they are working on.",
  "Career conversation prompts tied to the exact internship each student is in.",
  "Weekly follow-ups on the students who went quiet.",
  "Skill growth across communication, creativity, business mindset, and leadership.",
];

export default function SchoolsPage() {
  return (
    <>
      {/* HERO */}
      <section
        className="relative pt-32 pb-20 lg:pt-44 lg:pb-28 bg-ink overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <Image
          src="/images/doodles/Doodle 62@3x.png"
          alt=""
          width={130}
          height={130}
          className="absolute top-24 right-10 opacity-20 rotate-12 pointer-events-none hidden lg:block"
          aria-hidden="true"
        />
        <div className="container-site relative z-10">
          <p className="text-xs font-medium text-orange uppercase tracking-widest mb-5 fade-up">
            For Schools &amp; Programs
          </p>
          <h1 className="font-display font-black text-6xl lg:text-8xl text-cream leading-none tracking-tight uppercase mb-6 max-w-3xl fade-up stagger-1">
            Bring Ambition<br />
            <span className="text-orange">to your students.</span>
          </h1>
          <p className="text-gray-mid text-lg lg:text-xl max-w-2xl leading-relaxed mb-10 fade-up stagger-2">
            Career exposure for every student in the building, run by the adults already in the room.
          </p>
          <a
            href="#start"
            className="inline-flex items-center bg-orange hover:bg-orange-dark text-white font-semibold text-base px-8 py-4 rounded-full transition-colors shadow-lg shadow-orange/30 min-h-[52px] fade-up stagger-3"
          >
            Start the conversation
          </a>
        </div>
      </section>

      {/* WHO IT IS FOR + WHAT IT TAKES */}
      <section className="section-pad">
        <div className="container-site">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
            {/* Who it is for */}
            <div>
              <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
                Who It Is For
              </p>
              <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink tracking-tight leading-tight mb-8">
                If you run time with teens, this fits inside it.
              </h2>
              <ul className="space-y-3">
                {settings.map((s) => (
                  <li key={s} className="flex items-start gap-3 text-charcoal text-base leading-relaxed">
                    <span className="w-6 h-6 rounded-full bg-orange-light border border-orange/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            {/* What it takes from you */}
            <div
              className="bg-orange-light border border-orange/10 rounded-card-lg p-8 lg:p-10 relative overflow-hidden self-start"
              style={{
                backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.12) 1px, transparent 1px)",
                backgroundSize: "18px 18px",
              }}
            >
              <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
                What It Takes From You
              </p>
              <div className="space-y-4 mb-6">
                {[
                  "Chromebooks or a computer lab.",
                  "Fifteen minutes, twice a week.",
                  "One adult who owns it.",
                ].map((item, i) => (
                  <div key={item} className="flex items-center gap-4">
                    <span className="font-display font-black text-3xl text-orange tracking-tight flex-shrink-0 w-10">
                      0{i + 1}
                    </span>
                    <span className="font-heading font-semibold text-ink text-lg">{item}</span>
                  </div>
                ))}
              </div>
              <p className="text-charcoal text-base leading-relaxed border-t border-orange/20 pt-5">
                That is the whole ask. Your staff does not run it. Nobody from Ambition sits in your room.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT YOUR STUDENTS GET */}
      <section
        className="section-pad bg-ink relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <div className="max-w-3xl">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              What Your Students Get
            </p>
            <h2 className="font-heading font-bold text-3xl lg:text-5xl text-cream tracking-tight leading-tight mb-6">
              Thirty days inside a real career, then another one.
            </h2>
            <p className="text-gray-mid text-lg leading-relaxed">
              By the end of the year they have tried on four careers they had never seen up close, and they can tell you what each one pays and what the path in looks like.
            </p>
          </div>
        </div>
      </section>

      {/* WHAT YOUR ADULTS GET — dashboard */}
      <section className="section-pad bg-[#F5F4F0]">
        <div className="container-site">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              What Your Adults Get
            </p>
            <h2 className="font-heading font-bold text-3xl lg:text-5xl text-ink tracking-tight leading-tight">
              Every adult in the room sees every student&apos;s progress.
            </h2>
          </div>

          <DashboardMockup frame="school" className="max-w-4xl mx-auto mb-12 fade-up" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {adultFeatures.map((f) => (
              <div
                key={f}
                className="bg-white border border-gray-light rounded-card p-5 shadow-sm flex items-start gap-3"
              >
                <span className="w-6 h-6 rounded-full bg-orange-light border border-orange/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <p className="text-charcoal text-sm leading-relaxed">{f}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOR YOUR COUNSELORS */}
      <section className="section-pad">
        <div className="container-site">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              For Your Counselors
            </p>
            <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink tracking-tight leading-tight mb-6">
              Ambition is the layer underneath the counseling office.
            </h2>
            <p className="text-gray-warm text-lg leading-relaxed">
              Students who have moved through real careers show up with actual questions instead of a blank stare. Your counselors do less explaining and more advising.
            </p>
          </div>
        </div>
      </section>

      {/* ONE TEEN OR A SMALL GROUP — the individual guide mention */}
      <section id="guides" className="section-pad bg-[#F5F4F0] scroll-mt-24">
        <div className="container-site">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              One Teen or a Small Group?
            </p>
            <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink tracking-tight leading-tight mb-6">
              You don&apos;t need a building to run this.
            </h2>
            <p className="text-gray-warm text-lg leading-relaxed mb-8">
              Parents and individual mentors use Ambition with one teen or a handful. The teen downloads the app and starts today — free, same internships, same thirty days. You sign up as a Guide and get the same dashboard: their progress, and conversation prompts tied to the internship they&apos;re in right now.
            </p>
            <div className="flex flex-wrap gap-4 justify-center items-center">
              <AppStoreButtons variant="pill" theme="light" source="schools_guides" />
            </div>
            <p className="text-gray-warm text-sm mt-6">
              Want Guide access?{" "}
              <a href="#start" className="text-orange font-semibold hover:text-orange-dark transition-colors">
                Tell us about your teen below
              </a>{" "}
              and pick &ldquo;Individual mentor or parent.&rdquo;
            </p>
          </div>
        </div>
      </section>

      {/* WHAT IT COSTS + FORM */}
      <section
        id="start"
        className="section-pad bg-ink relative overflow-hidden scroll-mt-24"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div>
              <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
                What It Costs
              </p>
              <h2 className="font-heading font-bold text-3xl lg:text-5xl text-cream tracking-tight leading-tight mb-6">
                Most partnerships are fully sponsored by a donor.
              </h2>
              <p className="text-gray-mid text-lg leading-relaxed">
                So the school pays nothing in year one. Tell us about your students and we will walk you through what it takes.
              </p>
            </div>

            <div className="bg-cream rounded-card-lg shadow-2xl p-8 lg:p-10">
              <h3 className="font-heading font-bold text-2xl text-ink tracking-tight mb-6">
                Start the conversation.
              </h3>
              <SchoolsInquiryForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
