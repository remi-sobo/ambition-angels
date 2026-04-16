"use client";

import { useState } from "react";

const tracks = [
  {
    category: "Business & Entrepreneurship",
    title: "Entrepreneurship",
    emoji: "🚀",
    employer: "Gen Tech",
    employerDesc: "A teen-only social video app startup",
    internshipDesc: "Intern for tech entrepreneurs building a new social video app for teens.",
    deliverable: "A detailed business model plan covering customer segments, value props, revenue streams, and more.",
    phases: ["Customer Segments", "People Problems & Needs", "Value Propositions", "Solutions", "Revenue & Costs", "Key Metrics & Channels"],
  },
  {
    category: "Business & Entrepreneurship",
    title: "Marketing",
    emoji: "📣",
    employer: "YAP (Young and Powerful)",
    employerDesc: "A new streetwear brand empowering youth",
    internshipDesc: "Intern on the marketing team of a new fashion company that's trying to grow.",
    deliverable: "A comprehensive marketing plan spanning market analysis, brand strategy, promotion, and budgeting.",
    phases: ["Market Analysis", "Marketing Objectives", "Target Markets", "Brand Strategy", "Promotion Strategy", "Performance Metrics"],
  },
  {
    category: "Business & Entrepreneurship",
    title: "Sales",
    emoji: "🤝",
    employer: "Harmony Headphones",
    employerDesc: "An audio tech company launching premium headphones",
    internshipDesc: "Intern on the sales team at an audio technology company launching a new product line.",
    deliverable: "A comprehensive sales plan spanning prospecting to closing, designed to drive revenue growth.",
    phases: ["Preparing", "Prospecting", "Approaching", "Presenting", "Handling Objections", "Closing & Following Up"],
  },
  {
    category: "Business & Entrepreneurship",
    title: "Social Media Management",
    emoji: "📱",
    employer: "Royal",
    employerDesc: "An up-and-coming musical artist building a fanbase",
    internshipDesc: "Intern on the social media management team for an up-and-coming musical artist.",
    deliverable: "A comprehensive social media plan to grow Royal's fanbase and keep fans engaged.",
    phases: ["Goals & Objectives", "Target Audience", "Content Strategy", "Platform Strategy", "Engagement", "Analytics & Reporting"],
  },
  {
    category: "Business & Entrepreneurship",
    title: "HR Management",
    emoji: "👥",
    employer: "OurMart",
    employerDesc: "A community-first retail brand with locations nationwide",
    internshipDesc: "Intern at a retail headquarters to help onboard new store employees for a busy season.",
    deliverable: "A complete onboarding plan covering goals, safety, duties, systems, and more.",
    phases: ["Foundation", "Preparation", "Day One", "Culture & Policies", "Training", "Performance & Support"],
  },
  {
    category: "Business & Entrepreneurship",
    title: "Event Planning",
    emoji: "🎉",
    employer: "Make Memories",
    employerDesc: "An event planning studio for parties, banquets, and festivals",
    internshipDesc: "Intern at an event agency to plan a victory rally for state-champion high school teams.",
    deliverable: "A comprehensive event plan covering timeline, vendors, budget, setup, and post-event review.",
    phases: ["Overview & Scope", "Budget", "Theme & Venue", "Vendors & Logistics", "Day-Of Operations", "Post-Event Review"],
  },
  {
    category: "Business & Entrepreneurship",
    title: "Project Management",
    emoji: "📋",
    employer: "Higher Learning",
    employerDesc: "A student-focused edtech platform",
    internshipDesc: "Intern at a tech company launching an innovative tutoring app for high schoolers.",
    deliverable: "A living project plan for the app launch covering goals, schedule, budget, and post-launch support.",
    phases: ["Project Introduction", "Stakeholders", "Scope & Schedule", "Budget & Resources", "Risk Management", "Launch & Support"],
  },
  {
    category: "Business & Entrepreneurship",
    title: "Wealth Management",
    emoji: "💰",
    employer: "Prosper Capital Advisors",
    employerDesc: "A private wealth management firm helping clients build lasting wealth",
    internshipDesc: "Intern at a wealth management firm to help a client build their personal wealth.",
    deliverable: "A comprehensive wealth management plan covering goals, budgeting, investing, and estate planning.",
    phases: ["Goals & Objectives", "Net Worth", "Budgeting & Cash Flow", "Investment Strategy", "Retirement & Insurance", "Tax & Estate Planning"],
  },
  {
    category: "Tech & Design",
    title: "Software Engineering",
    emoji: "💻",
    employer: "Tunesly",
    employerDesc: "A music streaming platform personalizing how we hear music",
    internshipDesc: "Intern at a music streaming tech company rethinking how we experience sound.",
    deliverable: "An engineering plan for a new music feature covering system design, database, API, and front-end.",
    phases: ["Architecture", "Database Design", "API Design", "Front-End", "Testing & Security", "Deployment"],
  },
  {
    category: "Tech & Design",
    title: "UX/UI Design",
    emoji: "🎨",
    employer: "Chatter",
    employerDesc: "A messaging app built for teens and young adults",
    internshipDesc: "Intern at a tech startup designing a chat app for teens and young adults.",
    deliverable: "A UX/UI design plan covering research, design, prototyping, testing, and launch.",
    phases: ["Overview & Stakeholders", "User Research", "Competitive Analysis", "Design System", "Prototyping & Testing", "Launch Plan"],
  },
  {
    category: "Tech & Design",
    title: "Game Design",
    emoji: "🎮",
    employer: "Outbreak Interactive",
    employerDesc: "An indie studio known for immersive social gaming",
    internshipDesc: "Intern at an indie game studio developing a multiplayer adventure for teens.",
    deliverable: "A game design plan covering narrative, core mechanics, multiplayer systems, and user experience.",
    phases: ["Foundation", "Narrative", "Gameplay", "Challenge & Rewards", "Multiplayer", "User Experience"],
  },
  {
    category: "Health & Wellness",
    title: "Registered Nursing",
    emoji: "🏥",
    employer: "University Hospital",
    employerDesc: "A medical center where expert nurses guide patient recovery",
    internshipDesc: "Intern at a hospital post-operative nursing unit helping care for a teen patient.",
    deliverable: "A complete care plan for a teen post-op leg recovery covering assessment, pain management, and discharge.",
    phases: ["Patient Info", "Recovery Goals", "Recovery Assessment", "Care Steps", "Therapy", "Discharge Planning"],
  },
  {
    category: "Health & Wellness",
    title: "Physical Therapy",
    emoji: "🦵",
    employer: "Rise & Recover Rehab",
    employerDesc: "A community clinic for safe, personalized rehab",
    internshipDesc: "Intern at a local rehab clinic helping design a recovery plan for a teen athlete.",
    deliverable: "A PT rehab plan for a teen soccer player recovering from ACL surgery.",
    phases: ["Intake", "Safety", "Assessment", "Treatment Goals", "Rehab Phases", "Home Program & Discharge"],
  },
  {
    category: "Health & Wellness",
    title: "Personal Training",
    emoji: "💪",
    employer: "Just Fitness",
    employerDesc: "A community gym where trainers transform lives",
    internshipDesc: "Intern at a gym where personal trainers empower clients to achieve their health goals.",
    deliverable: "A complete training plan for a new client, covering assessments, program design, and progressions.",
    phases: ["Assessment", "Goal Setting", "Program Design", "Nutrition Basics", "Session Planning", "Progress Tracking"],
  },
  {
    category: "Health & Wellness",
    title: "Mental Health Therapy",
    emoji: "🧠",
    employer: "Head Up Wellness",
    employerDesc: "A youth mental health center built on compassionate care",
    internshipDesc: "Intern at a leading youth mental health center dedicated to compassionate therapy.",
    deliverable: "A comprehensive treatment plan for a teen facing stress, covering assessment and long-term resilience strategies.",
    phases: ["Assessment", "Challenges & Diagnosis", "Treatment Objectives", "Interventions", "Progress Monitoring", "Long-Term Resilience"],
  },
  {
    category: "Health & Wellness",
    title: "Firefighting",
    emoji: "🔥",
    employer: "Station 53",
    employerDesc: "A firehouse responding to fires, medical calls, and rescues",
    internshipDesc: "Intern at a local fire station responding to community emergencies.",
    deliverable: "A fire response plan covering everything from dispatch to post-incident review.",
    phases: ["Alert & Dispatch", "En Route", "Arrival & Size-Up", "Fire Attack", "Overhaul & Safety", "Post-Incident Review"],
  },
  {
    category: "Creative & Trades",
    title: "Chef / Culinary Arts",
    emoji: "👨‍🍳",
    employer: "Fireside",
    employerDesc: "A neighborhood restaurant crafting themed menus for community events",
    internshipDesc: "Intern at a local restaurant creating a special prom menu for high schoolers.",
    deliverable: "A prom menu plan covering dish selection, recipes, plating guides, service pacing, and safety.",
    phases: ["Concept Development", "Menu Design", "Recipes", "Plating & Presentation", "Service Planning", "Safety & Sanitation"],
  },
  {
    category: "Creative & Trades",
    title: "Photography & Videography",
    emoji: "📸",
    employer: "Imagine Images",
    employerDesc: "A full-service studio crafting photo and video experiences",
    internshipDesc: "Intern at a creative studio designing a graduation photoshoot and party video.",
    deliverable: "A media production plan covering client consult, shoot days, editing, and delivery.",
    phases: ["Client Consultation", "Pre-Production", "Production", "Post-Production", "Delivery & Review", "Client Management"],
  },
  {
    category: "Creative & Trades",
    title: "Stylist / Barber",
    emoji: "✂️",
    employer: "Cut-N-Style",
    employerDesc: "A community salon and barbershop offering classic cuts to intricate styles",
    internshipDesc: "Intern at a popular salon and barbershop in the heart of the community.",
    deliverable: "A personalized success plan to enter the hair styling industry, from skill development to client retention.",
    phases: ["Skill Development", "Practice & Training", "Tools & Equipment", "Client Relations", "Business Basics", "Career Planning"],
  },
];

const CATEGORIES = [
  "All",
  "Business & Entrepreneurship",
  "Tech & Design",
  "Health & Wellness",
  "Creative & Trades",
];

export default function CurriculumPage() {
  const [active, setActive] = useState("All");

  const visible = active === "All" ? tracks : tracks.filter((t) => t.category === active);

  return (
    <>
      {/* HERO */}
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
              Internship Tracks
            </p>
            <h1 className="font-display font-black text-6xl lg:text-7xl text-cream mb-6 leading-none tracking-tight uppercase">
              19 career tracks.<br />
              30 days each.<br />
              <span className="text-orange">All free.</span>
            </h1>
            <p className="text-gray-mid text-lg lg:text-xl leading-relaxed max-w-2xl">
              Each track is a simulated internship — a real employer, real deliverables, and real career skills. 15 minutes a day. On the phone they already have.
            </p>
          </div>

          {/* Stats strip */}
          <div className="mt-14 flex flex-wrap gap-10">
            {[
              { number: "19", label: "Career tracks" },
              { number: "30", label: "Days per internship" },
              { number: "15 min", label: "Per day" },
              { number: "100%", label: "Free" },
            ].map((s) => (
              <div key={s.label}>
                <div className="font-display font-black text-4xl text-orange tracking-tight leading-none">{s.number}</div>
                <div className="text-gray-mid text-sm mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FILTER + GRID */}
      <section className="section-pad bg-cream">
        <div className="container-site">

          {/* Filter buttons */}
          <div className="flex flex-wrap gap-3 mb-10">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActive(cat)}
                className={`text-sm font-medium px-5 py-2 rounded-full border transition-all ${
                  active === cat
                    ? "bg-orange text-white border-orange shadow-md shadow-orange/20"
                    : "bg-white text-charcoal border-gray-mid/40 hover:border-orange/40 hover:text-orange"
                }`}
              >
                {cat}
              </button>
            ))}
            <span className="ml-auto self-center text-sm text-gray-warm">
              {visible.length} track{visible.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visible.map((track) => (
              <div
                key={track.title}
                className="group bg-white border border-gray-light rounded-card-lg p-7 shadow-sm hover:shadow-lg hover:border-orange/30 hover:-translate-y-0.5 transition-all flex flex-col"
              >
                {/* Emoji + employer tag */}
                <div className="flex items-start justify-between gap-3 mb-5">
                  <span className="text-3xl leading-none">{track.emoji}</span>
                  <span className="text-xs font-medium px-3 py-1 rounded-full bg-orange-light text-orange border border-orange/20 text-right leading-snug">
                    {track.employer}
                  </span>
                </div>

                {/* Title */}
                <h2 className="font-heading font-bold text-xl text-ink mb-1 group-hover:text-orange transition-colors">
                  {track.title}
                </h2>

                {/* Employer description */}
                <p className="text-xs text-gray-warm mb-3">{track.employerDesc}</p>

                {/* Internship description */}
                <p className="text-gray-warm text-sm leading-relaxed mb-4">
                  {track.internshipDesc}
                </p>

                {/* Deliverable */}
                <div className="bg-gray-light rounded-xl px-4 py-3 mb-5">
                  <p className="text-xs font-medium text-charcoal uppercase tracking-widest mb-1">Deliverable</p>
                  <p className="text-sm text-charcoal leading-snug">{track.deliverable}</p>
                </div>

                {/* Phase pills */}
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {track.phases.map((phase) => (
                    <span
                      key={phase}
                      className="text-xs px-2.5 py-1 rounded-full bg-ink/5 text-charcoal border border-ink/10"
                    >
                      {phase}
                    </span>
                  ))}
                </div>

                {/* Available badge */}
                <div className="mt-auto pt-4 border-t border-gray-light flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Available in the App
                  </span>
                  <span className="text-xs text-gray-warm bg-gray-light px-2.5 py-1 rounded-full">
                    {track.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* UPCOMING TRACKS */}
      <section className="section-pad bg-[#F5F4F0]">
        <div className="container-site">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
              Coming Soon
            </p>
            <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-5">
              More career tracks in development.
            </h2>
            <p className="text-gray-warm text-lg leading-relaxed">
              Each new track takes funding to build — employer partnerships, production, and content design. Help us get these to teens faster.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 mb-10">
            {[
              "AI & Machine Learning",
              "Real Estate",
              "Teaching & Education",
              "Law & Advocacy",
              "Social Work",
              "Cybersecurity",
            ].map((track) => (
              <span
                key={track}
                className="inline-flex items-center bg-white border border-orange/20 text-ink text-sm font-semibold px-4 py-2.5 rounded-full"
              >
                {track}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <a
              href="/donate"
              className="inline-flex items-center bg-orange hover:bg-orange-dark text-white font-semibold px-7 py-3.5 rounded-full transition-colors text-sm min-h-[44px]"
            >
              Fund a new track
            </a>
            <a
              href="mailto:hello@ambitionangels.org?subject=Track%20suggestion"
              className="text-orange font-semibold text-sm hover:text-orange-dark transition-colors underline underline-offset-2"
            >
              Or tell us what&apos;s missing
            </a>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section
        className="section-pad bg-ink relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10 text-center">
          <p className="text-xs font-medium text-orange uppercase tracking-widest mb-4">
            Get started
          </p>
          <h2 className="font-heading font-bold text-4xl lg:text-5xl text-cream mb-5 leading-tight">
            Ready to start your internship?
          </h2>
          <p className="text-gray-mid text-lg leading-relaxed mb-10 max-w-xl mx-auto">
            Download the Ambition app and pick your first track. 15 minutes a day. Real career skills. Free for every student.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href="https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-orange hover:bg-orange-dark text-white font-semibold px-8 py-4 rounded-full transition-colors shadow-lg shadow-orange/30 min-h-[52px]"
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              Download for iOS
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.theambitionapp.ambitionappRN&pcampaignid=web_share"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-cream/10 hover:bg-cream/20 text-cream font-semibold px-8 py-4 rounded-full transition-colors border border-cream/20 min-h-[52px]"
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3.18 23.76c.3.17.64.22.99.14l12.45-7.19-2.78-2.78-10.66 9.83zm-1.81-20.1c-.22.3-.35.7-.35 1.18v18.32c0 .48.13.88.36 1.18l.06.06 10.26-10.26v-.24L1.43 3.6l-.06.06zm20.43 8.83l-2.9-1.68-3.06 3.06 3.06 3.06 2.91-1.69c.83-.48.83-1.27-.01-1.75zM4.17.38L16.62 7.57l-2.78 2.78L3.18.52C3.5.35 3.86.28 4.17.38z" />
              </svg>
              Download for Android
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
