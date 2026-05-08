"use client";

import { Lora } from "next/font/google";
import { FormEvent, useEffect, useRef, useState } from "react";

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-lora",
  display: "swap",
});

const SHANNON_FIELDS = [
  "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10",
  "a11", "a12", "a13", "a14", "a15", "a16", "a17", "a18", "a19", "a20",
];

const STYLES = `
  .shannon-scope, .shannon-scope *, .shannon-scope *::before, .shannon-scope *::after {
    box-sizing: border-box;
  }
  .shannon-scope {
    --cream: #FAF7F2;
    --warm-white: #F5F0E8;
    --sage: #8A9E8C;
    --deep-sage: #4A6B4E;
    --terracotta: #C4704A;
    --warm-brown: #6B4E35;
    --charcoal: #2C2C2C;
    --mid-gray: #6B6B6B;
    --light-gray: #D9D4CC;
    --gold: #C9A84C;
    background: var(--cream);
    color: var(--charcoal);
    font-family: var(--font-body), 'DM Sans', sans-serif;
    font-weight: 300;
    min-height: 100vh;
    overflow-x: hidden;
    position: relative;
  }
  .shannon-scope p, .shannon-scope h1, .shannon-scope h2, .shannon-scope h3,
  .shannon-scope label, .shannon-scope input, .shannon-scope textarea,
  .shannon-scope select, .shannon-scope button { margin: 0; }

  .shannon-scope .hero {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 60px 24px;
    position: relative;
    background: linear-gradient(160deg, #FAF7F2 0%, #EDE6D8 60%, #E0D5C4 100%);
    overflow: hidden;
  }
  .shannon-scope .hero::before {
    content: '';
    position: absolute;
    top: -80px; right: -80px;
    width: 400px; height: 400px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(138,158,140,0.18) 0%, transparent 70%);
    pointer-events: none;
  }
  .shannon-scope .hero::after {
    content: '';
    position: absolute;
    bottom: -60px; left: -60px;
    width: 300px; height: 300px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(196,112,74,0.12) 0%, transparent 70%);
    pointer-events: none;
  }
  .shannon-scope .hero-eyebrow {
    font-family: var(--font-body), 'DM Sans', sans-serif;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--sage);
    margin-bottom: 24px;
    opacity: 0;
    animation: shannonFadeUp 0.8s ease forwards 0.2s;
  }
  .shannon-scope .hero h1 {
    font-family: var(--font-lora), Georgia, serif;
    font-size: clamp(38px, 7vw, 68px);
    font-weight: 400;
    line-height: 1.1;
    color: var(--warm-brown);
    margin-bottom: 28px;
    opacity: 0;
    animation: shannonFadeUp 0.9s ease forwards 0.4s;
  }
  .shannon-scope .hero h1 em { font-style: italic; color: var(--deep-sage); }
  .shannon-scope .hero-sub {
    font-size: clamp(16px, 2.5vw, 20px);
    line-height: 1.7;
    color: var(--mid-gray);
    max-width: 560px;
    margin-bottom: 48px;
    opacity: 0;
    animation: shannonFadeUp 1s ease forwards 0.6s;
  }
  .shannon-scope .scroll-cue {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    opacity: 0;
    animation: shannonFadeUp 1s ease forwards 1s;
    cursor: pointer;
    text-decoration: none;
  }
  .shannon-scope .scroll-cue span {
    font-size: 12px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--sage);
  }
  .shannon-scope .scroll-arrow {
    width: 1px;
    height: 40px;
    background: linear-gradient(to bottom, var(--sage), transparent);
    animation: shannonPulseLine 2s ease-in-out infinite;
  }

  .shannon-scope .letter-section {
    max-width: 680px;
    margin: 0 auto;
    padding: 100px 24px 80px;
  }
  .shannon-scope .letter-label {
    font-size: 11px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--terracotta);
    margin-bottom: 32px;
  }
  .shannon-scope .letter-text {
    font-family: var(--font-lora), Georgia, serif;
    font-size: 19px;
    line-height: 1.85;
    color: var(--charcoal);
  }
  .shannon-scope .letter-text p + p { margin-top: 24px; }
  .shannon-scope .letter-text strong { font-weight: 500; color: var(--warm-brown); }

  .shannon-scope .divider {
    width: 60px;
    height: 2px;
    background: linear-gradient(to right, var(--terracotta), var(--gold));
    margin: 64px auto;
    border-radius: 2px;
  }

  .shannon-scope .form-section {
    max-width: 720px;
    margin: 0 auto;
    padding: 0 24px 120px;
  }

  .shannon-scope .question-block {
    margin-bottom: 56px;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }
  .shannon-scope .question-block.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .shannon-scope .q-number {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 2px;
    color: var(--terracotta);
    text-transform: uppercase;
    margin-bottom: 10px;
  }
  .shannon-scope .q-label {
    font-family: var(--font-lora), Georgia, serif;
    font-size: 20px;
    font-weight: 400;
    color: var(--charcoal);
    line-height: 1.5;
    margin-bottom: 8px;
    display: block;
  }
  .shannon-scope .q-sub {
    font-size: 14px;
    color: var(--mid-gray);
    line-height: 1.6;
    margin-bottom: 16px;
  }

  .shannon-scope textarea {
    width: 100%;
    min-height: 140px;
    padding: 20px;
    background: var(--warm-white);
    border: 1.5px solid var(--light-gray);
    border-radius: 8px;
    font-family: var(--font-body), 'DM Sans', sans-serif;
    font-size: 16px;
    font-weight: 300;
    color: var(--charcoal);
    line-height: 1.7;
    resize: vertical;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    outline: none;
  }
  .shannon-scope textarea:focus {
    border-color: var(--sage);
    box-shadow: 0 0 0 3px rgba(138,158,140,0.15);
  }
  .shannon-scope textarea::placeholder {
    color: #BCBAB6;
    font-style: italic;
  }

  .shannon-scope .scale-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .shannon-scope .scale-label-end {
    font-size: 13px;
    color: var(--mid-gray);
    white-space: nowrap;
    min-width: 80px;
  }
  .shannon-scope .scale-label-end.right { text-align: right; }

  .shannon-scope input[type="range"] {
    flex: 1;
    min-width: 160px;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: linear-gradient(to right, var(--terracotta), var(--gold));
    border-radius: 4px;
    outline: none;
    cursor: pointer;
  }
  .shannon-scope input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 22px; height: 22px;
    border-radius: 50%;
    background: var(--warm-brown);
    border: 3px solid var(--cream);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    cursor: pointer;
    transition: transform 0.15s ease;
  }
  .shannon-scope input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }
  .shannon-scope input[type="range"]::-moz-range-thumb {
    width: 22px; height: 22px;
    border-radius: 50%;
    background: var(--warm-brown);
    border: 3px solid var(--cream);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    cursor: pointer;
  }
  .shannon-scope .scale-value {
    font-family: var(--font-lora), Georgia, serif;
    font-size: 22px;
    font-weight: 400;
    color: var(--terracotta);
    min-width: 40px;
    text-align: center;
  }

  .shannon-scope select {
    width: 100%;
    padding: 16px 20px;
    background-color: var(--warm-white);
    border: 1.5px solid var(--light-gray);
    border-radius: 8px;
    font-family: var(--font-body), 'DM Sans', sans-serif;
    font-size: 16px;
    font-weight: 300;
    color: var(--charcoal);
    outline: none;
    cursor: pointer;
    transition: border-color 0.2s ease;
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238A9E8C' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 20px center;
  }
  .shannon-scope select:focus { border-color: var(--sage); }

  .shannon-scope .chapter {
    margin: 80px 0 48px;
    padding: 40px;
    background: linear-gradient(135deg, rgba(74,107,78,0.06), rgba(196,112,74,0.04));
    border-left: 3px solid var(--deep-sage);
    border-radius: 0 12px 12px 0;
  }
  .shannon-scope .chapter-number {
    font-size: 11px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--deep-sage);
    margin-bottom: 8px;
  }
  .shannon-scope .chapter-title {
    font-family: var(--font-lora), Georgia, serif;
    font-size: clamp(22px, 3.5vw, 30px);
    font-weight: 400;
    color: var(--warm-brown);
    line-height: 1.3;
    margin-bottom: 12px;
  }
  .shannon-scope .chapter-desc {
    font-size: 15px;
    color: var(--mid-gray);
    line-height: 1.6;
  }

  .shannon-scope .submit-section {
    text-align: center;
    padding: 60px 24px 40px;
  }
  .shannon-scope .submit-note {
    font-family: var(--font-lora), Georgia, serif;
    font-style: italic;
    font-size: 17px;
    color: var(--mid-gray);
    max-width: 480px;
    margin: 0 auto 40px;
    line-height: 1.7;
  }
  .shannon-scope .submit-btn {
    display: inline-block;
    padding: 20px 56px;
    background: var(--warm-brown);
    color: var(--cream);
    font-family: var(--font-body), 'DM Sans', sans-serif;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 2px;
    text-transform: uppercase;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
    box-shadow: 0 4px 20px rgba(107,78,53,0.25);
  }
  .shannon-scope .submit-btn:hover:not(:disabled) {
    background: var(--deep-sage);
    transform: translateY(-2px);
    box-shadow: 0 8px 28px rgba(74,107,78,0.3);
  }
  .shannon-scope .submit-btn:active { transform: translateY(0); }
  .shannon-scope .submit-btn:disabled {
    cursor: not-allowed;
    opacity: 0.85;
  }
  .shannon-scope .submit-error {
    margin-top: 16px;
    color: var(--terracotta);
    font-size: 14px;
  }
  .shannon-scope .submit-loading-note {
    margin-top: 18px;
    font-family: var(--font-lora), Georgia, serif;
    font-style: italic;
    font-size: 15px;
    color: var(--sage);
  }

  .shannon-scope .success-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(250,247,242,0.97);
    z-index: 100;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 40px;
  }
  .shannon-scope .success-overlay.active { display: flex; }
  .shannon-scope .success-icon { font-size: 56px; margin-bottom: 24px; }
  .shannon-scope .success-overlay h2 {
    font-family: var(--font-lora), Georgia, serif;
    font-size: 36px;
    font-weight: 400;
    color: var(--warm-brown);
    margin-bottom: 16px;
  }
  .shannon-scope .success-overlay p {
    font-size: 18px;
    color: var(--mid-gray);
    max-width: 480px;
    line-height: 1.7;
    margin: 0 auto 12px;
  }

  .shannon-scope .progress-bar {
    position: fixed;
    top: 0; left: 0;
    height: 3px;
    background: linear-gradient(to right, var(--terracotta), var(--gold));
    z-index: 50;
    transition: width 0.3s ease;
    border-radius: 0 2px 2px 0;
  }

  @keyframes shannonFadeUp {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes shannonPulseLine {
    0%, 100% { opacity: 0.4; transform: scaleY(1); }
    50% { opacity: 1; transform: scaleY(1.1); }
  }

  @media (max-width: 600px) {
    .shannon-scope .chapter { padding: 28px 24px; }
    .shannon-scope .scale-row { flex-direction: column; align-items: stretch; }
    .shannon-scope .scale-label-end { min-width: auto; }
    .shannon-scope .scale-label-end.right { text-align: left; }
  }
`;

const LOADING_MESSAGES = [
  "Sending your answers…",
  "Reading every word carefully…",
  "Mapping out your three options…",
  "Working through the trade-offs…",
  "Almost there — putting it all together…",
];

export default function ShannonPage() {
  const [a2, setA2] = useState(5);
  const [a7, setA7] = useState(5);
  const [a9, setA9] = useState(5);
  const [a11, setA11] = useState(5);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingIdx, setLoadingIdx] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.body.scrollHeight - window.innerHeight;
      if (docHeight <= 0) {
        setProgress(0);
        return;
      }
      setProgress(Math.min(100, (scrollTop / docHeight) * 100));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".shannon-scope .question-block").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (status !== "submitting") {
      setLoadingIdx(0);
      return;
    }
    const id = setInterval(() => {
      setLoadingIdx((i) => Math.min(i + 1, LOADING_MESSAGES.length - 1));
    }, 6000);
    return () => clearInterval(id);
  }, [status]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setErrorMsg(null);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload: Record<string, string> = {};
    for (const key of SHANNON_FIELDS) {
      const v = fd.get(key);
      payload[key] = typeof v === "string" ? v : "";
    }

    try {
      const res = await fetch("/api/shannon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Something went wrong. Please try again.");
      }
      setStatus("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <div className={`shannon-scope ${lora.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      <div className="progress-bar" style={{ width: `${progress}%` }} />

      <section className="hero">
        <p className="hero-eyebrow">A space made just for you</p>
        <h1>
          Hey Gigi,
          <br />
          <em>let&apos;s think this through.</em>
        </h1>
        <p className="hero-sub">
          Remi and Kendra put this together because they love you and want to help you figure this out — not push you anywhere. Take your time with every question.
        </p>
        <a href="#letter" className="scroll-cue">
          <span>Keep reading</span>
          <div className="scroll-arrow" />
        </a>
      </section>

      <section id="letter" className="letter-section">
        <p className="letter-label">A note before you begin</p>
        <div className="letter-text">
          <p>
            You&apos;ve been in survival mode for a long time. You&apos;ve gotten yourself somewhere — a home you&apos;re proud of, a career that matters, grandkids who light up when they see you. That&apos;s not small. That&apos;s everything.
          </p>
          <p>
            But we&apos;ve been watching you, and we think you deserve to stop just surviving and start <strong>really living</strong>. That&apos;s what this is about. Not logistics. Life.
          </p>
          <p>
            This form is going to ask you some real questions. Some of them might feel hard to answer. That&apos;s okay. There are no wrong answers here. We&apos;re not trying to talk you into anything — we just want to understand what&apos;s actually going on inside so we can help you make the best decision for <strong>you</strong>.
          </p>
          <p>
            When you&apos;re done, your answers will get read carefully — by us, and by a thoughtful outside perspective we&apos;ve set up to help map out your options. Then we&apos;ll sit down together and talk it all through.
          </p>
          <p>Take your time. Be honest. And know that whatever you decide, we&apos;re with you.</p>
          <p style={{ marginTop: 32, fontStyle: "italic", color: "var(--sage)" }}>— Remi &amp; Kendra</p>
        </div>
      </section>

      <div className="divider" />

      <form ref={formRef} className="form-section" onSubmit={handleSubmit}>
        <div className="chapter">
          <p className="chapter-number">Part One</p>
          <h2 className="chapter-title">Where you are right now</h2>
          <p className="chapter-desc">Not where you were, not where you&apos;re going — just honest about today.</p>
        </div>

        <div className="question-block">
          <p className="q-number">01</p>
          <label className="q-label" htmlFor="a1">
            When you&apos;re back in Scapoose — after a visit here — how do you actually feel in those first few days home?
          </label>
          <p className="q-sub">Don&apos;t edit yourself. Just describe it honestly.</p>
          <textarea id="a1" name="a1" placeholder="Write whatever comes to mind first..." />
        </div>

        <div className="question-block">
          <p className="q-number">02</p>
          <label className="q-label" htmlFor="a2">
            On a scale from 1–10, how would you rate your day-to-day happiness in Scapoose right now?
          </label>
          <p className="q-sub">1 = really struggling, 10 = genuinely thriving</p>
          <div className="scale-row">
            <span className="scale-label-end">Really struggling</span>
            <input
              type="range"
              id="a2"
              name="a2"
              min={1}
              max={10}
              value={a2}
              onChange={(e) => setA2(Number(e.target.value))}
            />
            <span className="scale-value">{a2}</span>
            <span className="scale-label-end right">Genuinely thriving</span>
          </div>
        </div>

        <div className="question-block">
          <p className="q-number">03</p>
          <label className="q-label" htmlFor="a3">
            Talk about the loneliness. What does it actually feel like, and how often does it hit?
          </label>
          <p className="q-sub">We know this is real. You don&apos;t have to minimize it here.</p>
          <textarea id="a3" name="a3" placeholder="Be as honest as you want to be..." />
        </div>

        <div className="question-block">
          <p className="q-number">04</p>
          <label className="q-label" htmlFor="a4">
            What do you actually love about your life in Scapoose right now? What would you genuinely miss?
          </label>
          <p className="q-sub">There has to be something — be real about what it is.</p>
          <textarea id="a4" name="a4" placeholder="Maybe it's the quiet, maybe it's the house, maybe it's something small..." />
        </div>

        <div className="chapter">
          <p className="chapter-number">Part Two</p>
          <h2 className="chapter-title">The apartment. East Palo Alto. Us.</h2>
          <p className="chapter-desc">The opportunity that&apos;s on the table — and everything that comes with it.</p>
        </div>

        <div className="question-block">
          <p className="q-number">05</p>
          <label className="q-label" htmlFor="a5">
            When you picture yourself living in that apartment — like really picture it, six months in — what do you feel?
          </label>
          <p className="q-sub">Not what you think you should feel. What actually comes up?</p>
          <textarea id="a5" name="a5" placeholder="Excited? Nervous? A mix? Describe it..." />
        </div>

        <div className="question-block">
          <p className="q-number">06</p>
          <label className="q-label" htmlFor="a6">
            You&apos;ve stayed here for six months before. What was the hardest part? What was the best part?
          </label>
          <textarea id="a6" name="a6" placeholder="Be specific if you can..." />
        </div>

        <div className="question-block">
          <p className="q-number">07</p>
          <label className="q-label" htmlFor="a7">
            One real concern you have about this is feeling like a guest in someone else&apos;s house — not fully free. On a scale of 1–10, how much does that worry you?
          </label>
          <p className="q-sub">1 = I can handle it, 10 = it would really bother me</p>
          <div className="scale-row">
            <span className="scale-label-end">I can handle it</span>
            <input
              type="range"
              id="a7"
              name="a7"
              min={1}
              max={10}
              value={a7}
              onChange={(e) => setA7(Number(e.target.value))}
            />
            <span className="scale-value">{a7}</span>
            <span className="scale-label-end right">Really worries me</span>
          </div>
        </div>

        <div className="question-block">
          <p className="q-number">08</p>
          <label className="q-label" htmlFor="a8">
            What would need to be true about the apartment — or about our arrangement — for you to feel at home there and not just like a guest?
          </label>
          <p className="q-sub">Think about what real independence looks like for you in that space.</p>
          <textarea id="a8" name="a8" placeholder="Specific things, feelings, agreements..." />
        </div>

        <div className="question-block">
          <p className="q-number">09</p>
          <label className="q-label" htmlFor="a9">
            Being this close to Jaiye, Kemi, and Sadé — showing up for games, Friday sleepovers, morning workouts — how much does that matter to you when you weigh this decision?
          </label>
          <div className="scale-row">
            <span className="scale-label-end">It matters some</span>
            <input
              type="range"
              id="a9"
              name="a9"
              min={1}
              max={10}
              value={a9}
              onChange={(e) => setA9(Number(e.target.value))}
            />
            <span className="scale-value">{a9}</span>
            <span className="scale-label-end right">More than anything</span>
          </div>
        </div>

        <div className="chapter">
          <p className="chapter-number">Part Three</p>
          <h2 className="chapter-title">The money picture</h2>
          <p className="chapter-desc">Let&apos;s get practical for a minute — because finances are real.</p>
        </div>

        <div className="question-block">
          <p className="q-number">10</p>
          <label className="q-label" htmlFor="a10">
            If you rented your Scapoose house for around $3,000 a month and only paid $800 here, that&apos;s potentially over $2,000 a month you could be saving. What does that possibility feel like to you?
          </label>
          <textarea id="a10" name="a10" placeholder="Is this exciting? Complicated? Stressful to think about?" />
        </div>

        <div className="question-block">
          <p className="q-number">11</p>
          <label className="q-label" htmlFor="a11">
            How stressful does the process of preparing your house to rent feel — packing, downsizing, making space for a tenant?
          </label>
          <div className="scale-row">
            <span className="scale-label-end">Manageable</span>
            <input
              type="range"
              id="a11"
              name="a11"
              min={1}
              max={10}
              value={a11}
              onChange={(e) => setA11(Number(e.target.value))}
            />
            <span className="scale-value">{a11}</span>
            <span className="scale-label-end right">Really overwhelming</span>
          </div>
        </div>

        <div className="question-block">
          <p className="q-number">12</p>
          <label className="q-label" htmlFor="a12">
            The longer-term vision is you owning a condo or townhouse down here. How real does that feel to you? And how much does that possibility motivate you?
          </label>
          <textarea id="a12" name="a12" placeholder="Does it feel possible? Far away? Something you want?" />
        </div>

        <div className="chapter">
          <p className="chapter-number">Part Four</p>
          <h2 className="chapter-title">Your heart. Your life. Your vision.</h2>
          <p className="chapter-desc">The deeper stuff — the things that actually drive a decision like this.</p>
        </div>

        <div className="question-block">
          <p className="q-number">13</p>
          <label className="q-label" htmlFor="a13">
            When you imagine yourself at 65 or 70, what do you want your life to actually look like? Where are you, who&apos;s around you, what does a normal day feel like?
          </label>
          <p className="q-sub">Even if you&apos;ve never had to think this way, take a shot at it. There&apos;s no right answer.</p>
          <textarea id="a13" name="a13" placeholder="Describe it like a scene in a movie..." />
        </div>

        <div className="question-block">
          <p className="q-number">14</p>
          <label className="q-label" htmlFor="a14">
            You&apos;ve spent a lot of your life in survival mode — just making it work. What does it feel like to be making a decision based on what you actually want rather than what you have to do?
          </label>
          <textarea id="a14" name="a14" placeholder="This one might take a minute. That's okay." />
        </div>

        <div className="question-block">
          <p className="q-number">15</p>
          <label className="q-label" htmlFor="a15">
            What&apos;s the thing you&apos;re most afraid of about making this move?
          </label>
          <textarea id="a15" name="a15" placeholder="Name it. Even if it feels small." />
        </div>

        <div className="question-block">
          <p className="q-number">16</p>
          <label className="q-label" htmlFor="a16">
            What&apos;s the thing you&apos;re most afraid of about NOT making this move?
          </label>
          <textarea id="a16" name="a16" placeholder="The other side of the fear..." />
        </div>

        <div className="question-block">
          <p className="q-number">17</p>
          <label className="q-label" htmlFor="a17">
            If you took Remi and Kendra completely out of the equation — no pressure, no influence — what does your gut actually say?
          </label>
          <p className="q-sub">What do YOU want?</p>
          <textarea id="a17" name="a17" placeholder="Just you. What does your gut say?" />
        </div>

        <div className="chapter">
          <p className="chapter-number">Part Five</p>
          <h2 className="chapter-title">The decision</h2>
          <p className="chapter-desc">Where you actually land — right now, in this moment.</p>
        </div>

        <div className="question-block">
          <p className="q-number">18</p>
          <label className="q-label" htmlFor="a18">
            If you had to lean one way right now — just a lean, not a final answer — which direction is it?
          </label>
          <select id="a18" name="a18" defaultValue="">
            <option value="">— Select one —</option>
            <option value="leaning_move">I&apos;m leaning toward making the move</option>
            <option value="leaning_stay">I&apos;m leaning toward staying in Scapoose</option>
            <option value="truly_unsure">I&apos;m genuinely torn and can&apos;t lean either way right now</option>
          </select>
        </div>

        <div className="question-block">
          <p className="q-number">19</p>
          <label className="q-label" htmlFor="a19">
            What would make this decision easier? What information, what conversation, what assurance would help you move forward?
          </label>
          <textarea id="a19" name="a19" placeholder="What do you need from us?" />
        </div>

        <div className="question-block">
          <p className="q-number">20</p>
          <label className="q-label" htmlFor="a20">
            Is there anything else you want Remi to know that you haven&apos;t been able to say yet — about any of this?
          </label>
          <p className="q-sub">This is your space. Use it.</p>
          <textarea id="a20" name="a20" style={{ minHeight: 180 }} placeholder="Anything at all..." />
        </div>

        <div className="submit-section">
          <p className="submit-note">
            When you&apos;re ready, send this in. We&apos;ll read every word — and we&apos;ve set up a thoughtful outside perspective to help map out your options. Then you and Remi will talk it through together.
          </p>
          <button type="submit" className="submit-btn" disabled={status === "submitting"}>
            {status === "submitting" ? LOADING_MESSAGES[loadingIdx] : "Send my answers"}
          </button>
          {status === "submitting" && (
            <p className="submit-loading-note">This usually takes about 20–30 seconds. Hang tight.</p>
          )}
          {status === "error" && errorMsg && <p className="submit-error">{errorMsg}</p>}
        </div>
      </form>

      <div className={`success-overlay ${status === "success" ? "active" : ""}`}>
        <div className="success-icon">🌿</div>
        <h2>Thank you, Gigi.</h2>
        <p>Your answers are in — and a full breakdown of your options is on its way to your inbox right now.</p>
        <p>Take a beat. Read it when you&apos;re ready. Then you and Remi will sit down and talk it through.</p>
        <p style={{ marginTop: 16, fontStyle: "italic", color: "var(--sage)" }}>You did a good thing today.</p>
      </div>
    </div>
  );
}
