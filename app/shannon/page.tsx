"use client";

import { Lora } from "next/font/google";
import { FormEvent, useEffect, useState } from "react";

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

const DEFAULT_ANSWERS: Record<string, string> = {
  a1: "", a2: "5", a3: "", a4: "",
  a5: "", a6: "", a7: "5", a8: "", a9: "5",
  a10: "", a11: "5", a12: "",
  a13: "", a14: "", a15: "", a16: "", a17: "",
  a18: "", a19: "", a20: "",
};

const STORAGE_PREFIX = "shannon-";

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

  .shannon-scope .save-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 14px;
  }
  .shannon-scope .save-btn {
    background: transparent;
    border: 1.5px solid var(--sage);
    color: var(--deep-sage);
    font-family: var(--font-body), 'DM Sans', sans-serif;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    padding: 9px 18px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .shannon-scope .save-btn:hover:not(.saved) {
    background: var(--warm-white);
  }
  .shannon-scope .save-btn.saved {
    background: var(--deep-sage);
    border-color: var(--deep-sage);
    color: white;
    cursor: default;
  }
  .shannon-scope .save-hint {
    font-size: 12px;
    color: var(--mid-gray);
    font-style: italic;
  }

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
  "Sending your answers...",
  "Reading every word carefully...",
  "Mapping out your three options...",
  "Working through the trade-offs...",
  "Almost there. Putting it all together.",
];

export default function ShannonPage() {
  const [answers, setAnswers] = useState<Record<string, string>>(DEFAULT_ANSWERS);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingIdx, setLoadingIdx] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored: Record<string, string> = {};
    SHANNON_FIELDS.forEach((key) => {
      const v = window.localStorage.getItem(STORAGE_PREFIX + key);
      if (v !== null) stored[key] = v;
    });
    if (Object.keys(stored).length > 0) {
      setAnswers((prev) => ({ ...prev, ...stored }));
      const savedFlags: Record<string, boolean> = {};
      Object.keys(stored).forEach((k) => { savedFlags[k] = true; });
      setSaved(savedFlags);
    }
  }, []);

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

  const updateAnswer = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    if (saved[key]) {
      setSaved((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const saveField = (key: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_PREFIX + key, answers[key] ?? "");
    setSaved((prev) => ({ ...prev, [key]: true }));
  };

  const clearStorage = () => {
    if (typeof window === "undefined") return;
    SHANNON_FIELDS.forEach((key) => window.localStorage.removeItem(STORAGE_PREFIX + key));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/shannon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Something went wrong. Try again in a minute.");
      }
      clearStorage();
      setStatus("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Try again in a minute.");
    }
  };

  const renderSaveButton = (key: string) => (
    <div className="save-row">
      <button
        type="button"
        className={`save-btn ${saved[key] ? "saved" : ""}`}
        onClick={() => saveField(key)}
      >
        {saved[key] ? "Saved ✓" : "Save my answer"}
      </button>
      {!saved[key] && <span className="save-hint">So you can come back to it.</span>}
    </div>
  );

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
          We put this together because we love you and we want to help you figure this out. Nobody is pushing you anywhere. Take your time with every question.
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
            You&apos;ve been in survival mode for a long time. And you&apos;ve gotten yourself somewhere real. A home you&apos;re proud of. A career that matters. Grandkids who light up the second they see you. That&apos;s not small. That&apos;s everything.
          </p>
          <p>
            But we&apos;ve been watching you. And we think you deserve to stop just surviving and start <strong>really living</strong>. That&apos;s what this is about. Not logistics. Life.
          </p>
          <p>
            This form is going to ask you some real questions. Some of them might feel hard. That&apos;s okay. There are no wrong answers here. We&apos;re not trying to talk you into anything. We just want to know what&apos;s actually going on inside you, so we can help you make the right call for <strong>you</strong>.
          </p>
          <p>
            When you&apos;re done, we read every word. We also have something set up that takes everything you said and lays it out as three clear paths forward, with the trade-offs honest and visible. Then you and Remi sit down together and talk it through.
          </p>
          <p>
            You can save your answer on each question as you go, so if you need to step away and come back later, you don&apos;t lose anything.
          </p>
          <p>Take your time. Be honest. Whatever you decide, we&apos;re with you.</p>
          <p style={{ marginTop: 32, fontStyle: "italic", color: "var(--sage)" }}>Love, Remi &amp; Kendra</p>
        </div>
      </section>

      <div className="divider" />

      <form className="form-section" onSubmit={handleSubmit}>
        <div className="chapter">
          <p className="chapter-number">Part One</p>
          <h2 className="chapter-title">Where you are right now</h2>
          <p className="chapter-desc">Honest about today. Not where you were. Not where you&apos;re going.</p>
        </div>

        <div className="question-block">
          <p className="q-number">01</p>
          <label className="q-label" htmlFor="a1">
            When you get back to Scapoose after being here, how do you actually feel those first few days home?
          </label>
          <p className="q-sub">Don&apos;t filter. Just say it real.</p>
          <textarea
            id="a1"
            name="a1"
            placeholder="Write whatever comes to mind first."
            value={answers.a1}
            onChange={(e) => updateAnswer("a1", e.target.value)}
          />
          {renderSaveButton("a1")}
        </div>

        <div className="question-block">
          <p className="q-number">02</p>
          <label className="q-label" htmlFor="a2">
            On a scale of 1 to 10, how would you rate your day-to-day happiness in Scapoose right now?
          </label>
          <p className="q-sub">1 is really struggling. 10 is genuinely thriving.</p>
          <div className="scale-row">
            <span className="scale-label-end">Really struggling</span>
            <input
              type="range"
              id="a2"
              name="a2"
              min={1}
              max={10}
              value={answers.a2}
              onChange={(e) => updateAnswer("a2", e.target.value)}
            />
            <span className="scale-value">{answers.a2}</span>
            <span className="scale-label-end right">Genuinely thriving</span>
          </div>
          {renderSaveButton("a2")}
        </div>

        <div className="question-block">
          <p className="q-number">03</p>
          <label className="q-label" htmlFor="a3">
            Talk about the loneliness. What does it actually feel like, and how often does it hit?
          </label>
          <p className="q-sub">We know this is real. You don&apos;t have to make it smaller than it is.</p>
          <textarea
            id="a3"
            name="a3"
            placeholder="Be as honest as you want to be."
            value={answers.a3}
            onChange={(e) => updateAnswer("a3", e.target.value)}
          />
          {renderSaveButton("a3")}
        </div>

        <div className="question-block">
          <p className="q-number">04</p>
          <label className="q-label" htmlFor="a4">
            What do you actually love about your life in Scapoose right now? What would you genuinely miss?
          </label>
          <p className="q-sub">There has to be something. Be real about what it is.</p>
          <textarea
            id="a4"
            name="a4"
            placeholder="Maybe it's the quiet. Maybe it's the house. Maybe it's something small."
            value={answers.a4}
            onChange={(e) => updateAnswer("a4", e.target.value)}
          />
          {renderSaveButton("a4")}
        </div>

        <div className="chapter">
          <p className="chapter-number">Part Two</p>
          <h2 className="chapter-title">The apartment. East Palo Alto. Us.</h2>
          <p className="chapter-desc">What&apos;s actually on the table, and everything that comes with it.</p>
        </div>

        <div className="question-block">
          <p className="q-number">05</p>
          <label className="q-label" htmlFor="a5">
            Picture yourself living in that apartment. Six months in. What do you feel?
          </label>
          <p className="q-sub">Not what you think you should feel. What actually comes up?</p>
          <textarea
            id="a5"
            name="a5"
            placeholder="Excited? Nervous? A mix? Describe it."
            value={answers.a5}
            onChange={(e) => updateAnswer("a5", e.target.value)}
          />
          {renderSaveButton("a5")}
        </div>

        <div className="question-block">
          <p className="q-number">06</p>
          <label className="q-label" htmlFor="a6">
            You stayed here for six months before. What was the hardest part? What was the best part?
          </label>
          <textarea
            id="a6"
            name="a6"
            placeholder="Be specific if you can."
            value={answers.a6}
            onChange={(e) => updateAnswer("a6", e.target.value)}
          />
          {renderSaveButton("a6")}
        </div>

        <div className="question-block">
          <p className="q-number">07</p>
          <label className="q-label" htmlFor="a7">
            One real concern is feeling like a guest in someone else&apos;s house. Not fully free in your own space. On a scale of 1 to 10, how much does that worry you?
          </label>
          <p className="q-sub">1 is I can handle it. 10 is it would really bother me.</p>
          <div className="scale-row">
            <span className="scale-label-end">I can handle it</span>
            <input
              type="range"
              id="a7"
              name="a7"
              min={1}
              max={10}
              value={answers.a7}
              onChange={(e) => updateAnswer("a7", e.target.value)}
            />
            <span className="scale-value">{answers.a7}</span>
            <span className="scale-label-end right">Really worries me</span>
          </div>
          {renderSaveButton("a7")}
        </div>

        <div className="question-block">
          <p className="q-number">08</p>
          <label className="q-label" htmlFor="a8">
            What would need to be true about the apartment, or about how we set things up, for you to actually feel at home there?
          </label>
          <p className="q-sub">Think about what real independence looks like for you in that space.</p>
          <textarea
            id="a8"
            name="a8"
            placeholder="Specific things, feelings, agreements."
            value={answers.a8}
            onChange={(e) => updateAnswer("a8", e.target.value)}
          />
          {renderSaveButton("a8")}
        </div>

        <div className="question-block">
          <p className="q-number">09</p>
          <label className="q-label" htmlFor="a9">
            Being close to Jaiye, Kemi, and Sadé. Showing up for games. Friday sleepovers. Morning workouts. How much does that matter to you when you weigh this decision?
          </label>
          <div className="scale-row">
            <span className="scale-label-end">It matters some</span>
            <input
              type="range"
              id="a9"
              name="a9"
              min={1}
              max={10}
              value={answers.a9}
              onChange={(e) => updateAnswer("a9", e.target.value)}
            />
            <span className="scale-value">{answers.a9}</span>
            <span className="scale-label-end right">More than anything</span>
          </div>
          {renderSaveButton("a9")}
        </div>

        <div className="chapter">
          <p className="chapter-number">Part Three</p>
          <h2 className="chapter-title">The money picture</h2>
          <p className="chapter-desc">Let&apos;s get practical for a minute. Money is real.</p>
        </div>

        <div className="question-block">
          <p className="q-number">10</p>
          <label className="q-label" htmlFor="a10">
            If you rented your Scapoose house for around $3,000 a month and only paid $800 here, that&apos;s potentially over $2,000 a month you could be saving. What does that possibility actually feel like to you?
          </label>
          <textarea
            id="a10"
            name="a10"
            placeholder="Is it exciting? Complicated? Stressful to think about?"
            value={answers.a10}
            onChange={(e) => updateAnswer("a10", e.target.value)}
          />
          {renderSaveButton("a10")}
        </div>

        <div className="question-block">
          <p className="q-number">11</p>
          <label className="q-label" htmlFor="a11">
            How stressful does it feel to think about getting your house ready to rent? The packing, the downsizing, making space for a tenant?
          </label>
          <div className="scale-row">
            <span className="scale-label-end">Manageable</span>
            <input
              type="range"
              id="a11"
              name="a11"
              min={1}
              max={10}
              value={answers.a11}
              onChange={(e) => updateAnswer("a11", e.target.value)}
            />
            <span className="scale-value">{answers.a11}</span>
            <span className="scale-label-end right">Really overwhelming</span>
          </div>
          {renderSaveButton("a11")}
        </div>

        <div className="question-block">
          <p className="q-number">12</p>
          <label className="q-label" htmlFor="a12">
            The longer-term vision is you owning a condo or townhouse down here. How real does that feel to you? And how much does that possibility motivate you?
          </label>
          <textarea
            id="a12"
            name="a12"
            placeholder="Does it feel possible? Far away? Something you actually want?"
            value={answers.a12}
            onChange={(e) => updateAnswer("a12", e.target.value)}
          />
          {renderSaveButton("a12")}
        </div>

        <div className="chapter">
          <p className="chapter-number">Part Four</p>
          <h2 className="chapter-title">Your heart. Your life. Your vision.</h2>
          <p className="chapter-desc">The deeper stuff. The things that actually drive a decision like this.</p>
        </div>

        <div className="question-block">
          <p className="q-number">13</p>
          <label className="q-label" htmlFor="a13">
            When you imagine yourself at 65 or 70, what do you want your life to actually look like? Where are you, who&apos;s around you, what does a normal day feel like?
          </label>
          <p className="q-sub">Even if you&apos;ve never had to think this way before, take a shot at it. There&apos;s no right answer.</p>
          <textarea
            id="a13"
            name="a13"
            placeholder="Describe it like a scene in a movie."
            value={answers.a13}
            onChange={(e) => updateAnswer("a13", e.target.value)}
          />
          {renderSaveButton("a13")}
        </div>

        <div className="question-block">
          <p className="q-number">14</p>
          <label className="q-label" htmlFor="a14">
            You&apos;ve spent a lot of your life in survival mode. Just making it work. What does it feel like to make a decision based on what YOU actually want this time?
          </label>
          <textarea
            id="a14"
            name="a14"
            placeholder="This one might take a minute. That's okay."
            value={answers.a14}
            onChange={(e) => updateAnswer("a14", e.target.value)}
          />
          {renderSaveButton("a14")}
        </div>

        <div className="question-block">
          <p className="q-number">15</p>
          <label className="q-label" htmlFor="a15">
            What&apos;s the thing you&apos;re most afraid of about making this move?
          </label>
          <textarea
            id="a15"
            name="a15"
            placeholder="Name it. Even if it feels small."
            value={answers.a15}
            onChange={(e) => updateAnswer("a15", e.target.value)}
          />
          {renderSaveButton("a15")}
        </div>

        <div className="question-block">
          <p className="q-number">16</p>
          <label className="q-label" htmlFor="a16">
            What&apos;s the thing you&apos;re most afraid of about NOT making this move?
          </label>
          <textarea
            id="a16"
            name="a16"
            placeholder="The other side of the fear."
            value={answers.a16}
            onChange={(e) => updateAnswer("a16", e.target.value)}
          />
          {renderSaveButton("a16")}
        </div>

        <div className="question-block">
          <p className="q-number">17</p>
          <label className="q-label" htmlFor="a17">
            If you took us completely out of the equation. No pressure, no influence. What does your gut actually say?
          </label>
          <p className="q-sub">What do YOU want?</p>
          <textarea
            id="a17"
            name="a17"
            placeholder="Just you. What does your gut say?"
            value={answers.a17}
            onChange={(e) => updateAnswer("a17", e.target.value)}
          />
          {renderSaveButton("a17")}
        </div>

        <div className="chapter">
          <p className="chapter-number">Part Five</p>
          <h2 className="chapter-title">The decision</h2>
          <p className="chapter-desc">Where you actually land. Right now, in this moment.</p>
        </div>

        <div className="question-block">
          <p className="q-number">18</p>
          <label className="q-label" htmlFor="a18">
            If you had to lean one way right now. Just a lean, not a final answer. Which way is it?
          </label>
          <select
            id="a18"
            name="a18"
            value={answers.a18}
            onChange={(e) => updateAnswer("a18", e.target.value)}
          >
            <option value="">Select one</option>
            <option value="leaning_move">I&apos;m leaning toward making the move</option>
            <option value="leaning_stay">I&apos;m leaning toward staying in Scapoose</option>
            <option value="truly_unsure">I&apos;m genuinely torn and can&apos;t lean either way right now</option>
          </select>
          {renderSaveButton("a18")}
        </div>

        <div className="question-block">
          <p className="q-number">19</p>
          <label className="q-label" htmlFor="a19">
            What would make this decision easier? What information, what conversation, what assurance would help you move forward?
          </label>
          <p className="q-sub">What do you need from us?</p>
          <textarea
            id="a19"
            name="a19"
            placeholder="What do you need from us?"
            value={answers.a19}
            onChange={(e) => updateAnswer("a19", e.target.value)}
          />
          {renderSaveButton("a19")}
        </div>

        <div className="question-block">
          <p className="q-number">20</p>
          <label className="q-label" htmlFor="a20">
            Is there anything else you want Remi to know that you haven&apos;t been able to say yet about any of this?
          </label>
          <p className="q-sub">This is your space. Use it.</p>
          <textarea
            id="a20"
            name="a20"
            style={{ minHeight: 180 }}
            placeholder="Anything at all."
            value={answers.a20}
            onChange={(e) => updateAnswer("a20", e.target.value)}
          />
          {renderSaveButton("a20")}
        </div>

        <div className="submit-section">
          <p className="submit-note">
            When you&apos;re ready, send it in. We&apos;ll read every word. You&apos;ll get back a clean breakdown of your three options. Then you and Remi sit down and talk it through together.
          </p>
          <button type="submit" className="submit-btn" disabled={status === "submitting"}>
            {status === "submitting" ? LOADING_MESSAGES[loadingIdx] : "Send my answers"}
          </button>
          {status === "submitting" && (
            <p className="submit-loading-note">This usually takes about 20 to 30 seconds. Hang tight.</p>
          )}
          {status === "error" && errorMsg && <p className="submit-error">{errorMsg}</p>}
        </div>
      </form>

      <div className={`success-overlay ${status === "success" ? "active" : ""}`}>
        <div className="success-icon">🌿</div>
        <h2>Thank you, Gigi.</h2>
        <p>Your answers are in. A full breakdown of your three options is on its way to your inbox.</p>
        <p>Read it when you&apos;re ready. Then you and Remi sit down and talk it through.</p>
        <p style={{ marginTop: 16, fontStyle: "italic", color: "var(--sage)" }}>You did a good thing today.</p>
      </div>
    </div>
  );
}
