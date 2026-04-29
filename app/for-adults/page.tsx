"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { trackEvent } from "@/lib/analytics";

const personas = [
  { emoji: "👩‍🏫", role: "Teachers", desc: "Give your students career context without adding to your plate." },
  { emoji: "🏀", role: "Coaches", desc: "Motivate players beyond the game. Help them see what they're playing toward." },
  { emoji: "🙏", role: "Youth Group Leaders", desc: "Connect purpose and faith to their future in a concrete way." },
  { emoji: "👨‍👧", role: "Parents", desc: "Finally have the career conversation you've been putting off. We'll guide you through it." },
  { emoji: "🤝", role: "Mentors", desc: "Show up to every meeting with something real to work through together." },
  { emoji: "🏫", role: "School Counselors", desc: "Scale career conversations across your entire caseload." },
];

const prompts = [
  "After doing the entrepreneurship internship — what surprised you most about running a business?",
  "If money wasn't a factor, what kind of work do you think you'd actually enjoy doing every day?",
  "What's one career you learned about this week that you'd never considered before? What made it interesting?",
];

const steps = [
  { num: "01", title: "Sign up as a Guide", desc: "Create your free account and tell us about the teen you're supporting." },
  { num: "02", title: "Set your teen up on the app", desc: "They download the Ambition app and start their first 30-day career internship." },
  { num: "03", title: "Start the conversation", desc: "We'll send you conversation prompts tied to what they're experiencing. You just show up." },
];

const problemCards = [
  {
    icon: "📊",
    stat: "Fewer than 5 careers",
    body: "Most teens have been exposed to fewer than 5 careers — usually whatever their parents do. The world has thousands of paths.",
  },
  {
    icon: "🎯",
    stat: "Future Orientation",
    body: "A teen's belief that their future is worth working toward is one of the strongest predictors of academic engagement. It can be built.",
  },
  {
    icon: "💬",
    stat: "The missing tool",
    body: "Teachers, coaches, and mentors want to have career conversations. They just don't have the language or tools to do it well.",
  },
];

export default function PartnersPage() {
  const waitlistRef = useRef<HTMLElement>(null);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    role: "",
    teen_count: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const scrollToWaitlist = () => {
    waitlistRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.first_name || !form.last_name || !form.email || !form.role) {
      setFormError("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/partner-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Something went wrong. Please try again.");
      }
      trackEvent("partner_waitlist_submitted", { role: form.role });
      setSubmitted(true);
      setForm({ first_name: "", last_name: "", email: "", role: "", teen_count: "" });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        className="relative min-h-[90vh] flex items-center overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <Image
          src="/images/parent-page.png"
          alt=""
          fill
          priority
          className="object-cover object-center"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-ink/65" />

        <div className="container-site relative z-10 pt-28 pb-28 lg:pt-40 lg:pb-36">
          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-5">
            For Guides
          </p>
          <h1 className="font-heading font-bold text-4xl sm:text-5xl lg:text-[3.5rem] xl:text-6xl text-cream leading-tight tracking-tight mb-6 max-w-3xl">
            You&apos;re already in their corner. Now we&apos;ll put something real in your hands.
          </h1>
          <p className="text-gray-mid text-lg leading-relaxed max-w-xl mb-10">
            We give you career conversation prompts, real-time insight into what your teen is learning, and a way to finally have the conversation you&apos;ve been putting off.
          </p>
          <button
            onClick={scrollToWaitlist}
            className="bg-orange hover:bg-orange-dark text-white font-semibold text-base px-8 py-4 rounded-full transition-colors min-h-[52px] inline-flex items-center w-full sm:w-auto justify-center"
          >
            Join the Waitlist
          </button>
        </div>
      </section>

      {/* ── THE GAP ──────────────────────────────────────────────────────── */}
      <section className="section-pad bg-cream">
        <div className="container-site">
          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
            The Gap
          </p>
          <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-12 max-w-3xl">
            Career exposure is one of the hardest things to deliver. We built the infrastructure so you don&apos;t have to.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {problemCards.map((card) => (
              <div
                key={card.stat}
                className="bg-white border border-gray-light rounded-card-lg p-8 shadow-sm"
              >
                <div className="text-4xl mb-5">{card.icon}</div>
                <div className="font-heading font-bold text-ink text-xl mb-3">{card.stat}</div>
                <p className="text-gray-warm text-sm leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section
        className="section-pad bg-ink relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
            How It Works
          </p>
          <h2 className="font-heading font-bold text-4xl lg:text-5xl text-cream tracking-tight leading-tight mb-12 max-w-2xl">
            Same app, built two different ways — one for your teen, one for you.
          </h2>

          {/* Teen / Guide split */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-10">
            {/* Teen */}
            <div className="bg-[#1a1d27] border border-white/10 rounded-card-lg p-8">
              <div className="inline-block text-xs font-bold text-gray-mid uppercase tracking-widest bg-white/5 border border-white/10 rounded-full px-3 py-1 mb-6">
                The Teen
              </div>
              <ul className="space-y-4">
                {[
                  "Completes a 30-day simulated career internship",
                  "Explores industries, builds career vision, increases motivation",
                  "Goes at their own pace through the mobile app",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-gray-mid text-sm leading-relaxed">
                    <span className="w-5 h-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-2.5 h-2.5 text-gray-mid" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Guide */}
            <div className="bg-orange/10 border border-orange/25 rounded-card-lg p-8">
              <div className="inline-block text-xs font-bold text-orange uppercase tracking-widest bg-orange/15 border border-orange/25 rounded-full px-3 py-1 mb-6">
                The Guide (you)
              </div>
              <ul className="space-y-4">
                {[
                  "See exactly what they're learning in real time",
                  "Get proprietary career conversation prompts tied to what they're experiencing",
                  "Track their progress and engagement",
                  "Show up to every conversation with something concrete",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-cream text-sm leading-relaxed">
                    <span className="w-5 h-5 rounded-full bg-orange flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── THE DEAL ─────────────────────────────────────────────────── */}
          <div className="mt-16 pt-14 border-t border-white/10">
            <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
              The Deal
            </p>
            <h3 className="font-heading font-bold text-3xl lg:text-4xl text-cream tracking-tight leading-tight mb-3 max-w-xl">
              Before they start — you make an agreement.
            </h3>
            <p className="text-gray-mid text-base leading-relaxed mb-10 max-w-2xl">
              Pick a reward. Make it real. That agreement is what turns the app into a mission.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {[
                { emoji: "🍕", tag: "For Parents", deal: "Complete 5 internships → pizza party of your choice" },
                { emoji: "📝", tag: "For Teachers", deal: "Finish 3 internships → one get-out-of-a-test-free card" },
                { emoji: "👟", tag: "For Coaches", deal: "Complete the sports business track → new kicks" },
              ].map((card) => (
                <div
                  key={card.tag}
                  className="bg-[#1a1d27] rounded-card p-6"
                  style={{ borderLeft: "4px solid #E8500A" }}
                >
                  <div className="text-3xl mb-4">{card.emoji}</div>
                  <div className="inline-block text-xs font-bold text-orange uppercase tracking-widest bg-orange/10 rounded-full px-2.5 py-1 mb-3">
                    {card.tag}
                  </div>
                  <p className="text-cream text-sm leading-relaxed font-medium">{card.deal}</p>
                </div>
              ))}
            </div>

            <p className="text-white/30 text-sm leading-relaxed max-w-2xl">
              The reward can be monetary, an experience, or a privilege — additive or something they&apos;d normally lose. We&apos;ll give you a starter list of ideas that work. The point is the agreement.
            </p>
          </div>

          {/* Three steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-14">
            {steps.map((step) => (
              <div
                key={step.num}
                className="flex items-start gap-4 bg-white/[0.04] border border-white/10 rounded-card p-6"
              >
                <div className="font-display font-black text-3xl text-orange leading-none flex-shrink-0 pt-0.5">
                  {step.num}
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-cream text-base mb-1">{step.title}</h3>
                  <p className="text-gray-mid text-sm leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THE AMBITION FUND ────────────────────────────────────────────── */}
      <section
        className="py-16 lg:py-20 relative overflow-hidden"
        style={{
          backgroundColor: "#1A0A00",
          backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.09) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          zIndex: 0,
        }}
      >
        {/* Orange glow behind headline */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[320px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, rgba(232,80,10,0.18) 0%, transparent 70%)", zIndex: 1 }}
        />
        <div className="container-site relative max-w-2xl" style={{ zIndex: 2 }}>
          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-5">
            The Ambition Fund
          </p>
          <h2 className="font-heading font-bold text-4xl lg:text-5xl text-white tracking-tight leading-tight mb-6">
            No support system? We&apos;ve got you.
          </h2>
          <div className="space-y-4 mb-8">
            <p className="text-white/90 text-base leading-relaxed">
              Some teens don&apos;t have an adult who can make the deal with them. The Ambition Fund exists for those kids.
            </p>
            <p className="text-white/90 text-base leading-relaxed">
              Low-income teens can apply directly through the app, make an agreement with Ambition Angels, and earn real rewards as they complete internships. We invest in them — and we keep investing as they grow.
            </p>
          </div>
          <a
            href="#"
            className="inline-flex items-center justify-center bg-orange hover:bg-orange-dark text-white font-semibold text-base px-10 py-4 rounded-full transition-colors min-h-[56px] w-full sm:w-auto shadow-lg shadow-orange/20"
          >
            Download the App to Apply
          </a>
          <p className="mt-4 text-white/40 text-sm">
            The Ambition Fund is made possible by donors like you.{" "}
            <a href="/donate" className="text-orange hover:text-orange-dark underline underline-offset-2 transition-colors">
              Become a donor.
            </a>
          </p>
        </div>
      </section>

      {/* ── CONVERSATION PROMPTS ─────────────────────────────────────────── */}
      <section className="section-pad bg-cream">
        <div className="container-site">
          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
            The Secret Weapon
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div>
              <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-5">
                We built the prompts. You have the relationship.
              </h2>
              <p className="text-gray-warm text-base leading-relaxed">
                Our proprietary career conversation prompts are designed to increase future orientation — a teen&apos;s belief that their future is worth working toward right now. You don&apos;t need to be a career counselor. You just need to show up.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              {prompts.map((prompt, i) => (
                <div
                  key={i}
                  className="bg-white border border-gray-light rounded-card p-6 shadow-sm"
                  style={{ borderLeft: "4px solid #E8500A" }}
                >
                  <p className="text-ink text-sm leading-relaxed font-medium">&ldquo;{prompt}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── WHO THIS IS FOR ──────────────────────────────────────────────── */}
      <section
        className="section-pad bg-ink relative overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="container-site relative z-10">
          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
            Who This Is For
          </p>
          <h2 className="font-heading font-bold text-4xl lg:text-5xl text-cream tracking-tight leading-tight mb-12 max-w-2xl">
            If you have a relationship with a teen, this is for you.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {personas.map((p) => (
              <div
                key={p.role}
                className="bg-[#1a1d27] border border-white/10 rounded-card-lg p-7 hover:border-orange/30 transition-colors"
              >
                <div className="text-4xl mb-4">{p.emoji}</div>
                <h3 className="font-heading font-bold text-cream text-lg mb-2">{p.role}</h3>
                <p className="text-gray-mid text-sm leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WAITLIST FORM ────────────────────────────────────────────────── */}
      <section ref={waitlistRef} className="section-pad bg-cream" id="waitlist">
        <div className="container-site max-w-2xl">
          <p className="text-xs font-bold text-orange uppercase tracking-widest mb-4">
            Join the Movement
          </p>
          <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-tight mb-3">
            We&apos;re piloting Guide access now.
          </h2>
          <p className="text-gray-warm text-base leading-relaxed mb-10">
            Be among the first to get access when we launch. We&apos;ll reach out personally.
          </p>

          {submitted && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-card p-5 mb-8">
              <svg
                className="w-6 h-6 text-green-600 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-heading font-semibold text-green-800">
                You&apos;re on the list. We&apos;ll be in touch.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-charcoal uppercase tracking-widest mb-2">
                  First Name <span className="text-orange">*</span>
                </label>
                <input
                  type="text"
                  name="first_name"
                  value={form.first_name}
                  onChange={handleChange}
                  required
                  placeholder="First name"
                  className="w-full border border-gray-mid rounded-card px-4 py-3.5 text-ink bg-white text-sm focus:outline-none focus:border-orange transition-colors min-h-[48px]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal uppercase tracking-widest mb-2">
                  Last Name <span className="text-orange">*</span>
                </label>
                <input
                  type="text"
                  name="last_name"
                  value={form.last_name}
                  onChange={handleChange}
                  required
                  placeholder="Last name"
                  className="w-full border border-gray-mid rounded-card px-4 py-3.5 text-ink bg-white text-sm focus:outline-none focus:border-orange transition-colors min-h-[48px]"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-charcoal uppercase tracking-widest mb-2">
                Email Address <span className="text-orange">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="you@example.com"
                className="w-full border border-gray-mid rounded-card px-4 py-3.5 text-ink bg-white text-sm focus:outline-none focus:border-orange transition-colors min-h-[48px]"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-semibold text-charcoal uppercase tracking-widest mb-2">
                Your Role <span className="text-orange">*</span>
              </label>
              <div className="relative">
                <select
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  required
                  className="w-full border border-gray-mid rounded-card px-4 py-3.5 text-ink bg-white text-sm focus:outline-none focus:border-orange transition-colors min-h-[48px] appearance-none pr-10"
                >
                  <option value="">Select your role…</option>
                  <option value="Teacher">Teacher</option>
                  <option value="Coach">Coach</option>
                  <option value="Parent">Parent</option>
                  <option value="Mentor">Mentor</option>
                  <option value="Youth Group Leader">Youth Group Leader</option>
                  <option value="School Counselor">School Counselor</option>
                  <option value="Other">Other</option>
                </select>
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                  <svg className="w-4 h-4 text-gray-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Teen count */}
            <div>
              <label className="block text-xs font-semibold text-charcoal uppercase tracking-widest mb-2">
                How many teens are you currently working with?
              </label>
              <div className="relative">
                <select
                  name="teen_count"
                  value={form.teen_count}
                  onChange={handleChange}
                  className="w-full border border-gray-mid rounded-card px-4 py-3.5 text-ink bg-white text-sm focus:outline-none focus:border-orange transition-colors min-h-[48px] appearance-none pr-10"
                >
                  <option value="">Select…</option>
                  <option value="1">1</option>
                  <option value="2-5">2–5</option>
                  <option value="6-15">6–15</option>
                  <option value="16-50">16–50</option>
                  <option value="50+">50+</option>
                </select>
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                  <svg className="w-4 h-4 text-gray-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {formError && (
              <p className="text-sm text-red-600 font-medium">{formError}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-orange hover:bg-orange-dark text-white font-semibold text-base px-8 py-4 rounded-full transition-colors min-h-[56px] disabled:opacity-60 flex items-center justify-center"
            >
              {submitting ? "Submitting…" : "Get Early Access"}
            </button>

            <p className="text-center text-xs text-gray-warm">
              No spam. Ever. We&apos;ll reach out personally when Guide access opens.
            </p>
          </form>
        </div>
      </section>
    </>
  );
}
