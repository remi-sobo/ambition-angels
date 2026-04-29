"use client";

import { trackEvent } from "@/lib/analytics";

import { useState, useEffect, useCallback } from "react";

interface Career {
  title: string;
  description: string;
  salary: string;
  why: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Answers = {
  age: string;
  status: string;
  location: string;
  subjects: string[];
  freetime: string;
  flowstate: string;
  workstyle: string[];
  whenwrong: string;
  problemtypes: string[];
  goodat: string;
  peoplecome: string;
  traits: Record<string, number>;
  workenvironments: string[];
  moneyvsmeaning: number;
  dreamday: string;
  futureself: string;
  teenname: string;
  email: string;
};

type Stage = "audience" | "survey" | "loading" | "results";

const SECTION_NAMES = [
  "About You",
  "What Lights You Up",
  "How You Are Wired",
  "Your Strengths",
  "Your Work Vision",
  "Your Future",
];


function getFallback(): Career[] {
  return [
    { title: "Youth Program Director", description: "You lead programs that change young lives every single day.", salary: "$75,000-$105,000/yr", why: "People skills and mission orientation are a natural fit." },
    { title: "Entrepreneur / Business Owner", description: "You build something from the ground up on your terms.", salary: "Unlimited potential", why: "You want independence and to call your own shots." },
    { title: "Construction Manager", description: "You lead teams that build real things in the world.", salary: "$120,000-$155,000/yr", why: "You like hands-on work and being in charge." },
    { title: "Personal Trainer / Gym Owner", description: "You help people get healthy and feel their best.", salary: "$75,000-$110,000/yr", why: "You care about people and love physical activity." },
    { title: "Financial Advisor", description: "You help people build and protect their wealth over time.", salary: "$100,000-$140,000/yr", why: "You are trusted and good with people and numbers." },
    { title: "Electrician (Union)", description: "You install and maintain electrical systems that power everything.", salary: "$108,000-$130,000/yr", why: "Hands-on, well-paid, no four-year degree needed." },
    { title: "Music Producer", description: "You create beats and sounds that move people deeply.", salary: "$80,000-$120,000/yr", why: "Music and creativity came up strong in your answers." },
    { title: "Real Estate Agent", description: "You connect people with properties and help build wealth.", salary: "$100,000+/yr", why: "Money focus and people skills are a strong match." },
    { title: "Registered Nurse", description: "You provide expert care and change lives every single day.", salary: "$130,000-$160,000/yr", why: "Helping people is core to who you are." },
    { title: "Creative Director", description: "You lead creative vision for brands, campaigns, and products.", salary: "$110,000-$145,000/yr", why: "Your creativity and leadership scored high." },
  ];
}

export default function CareerQuizModal({ isOpen, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("audience");
  const [audienceMode, setAudienceMode] = useState<"teen" | "adult">("teen");
  const [currentSection, setCurrentSection] = useState(1);
  const [careers, setCareers] = useState<Career[]>([]);
  const [emailSent, setEmailSent] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [answers, setAnswers] = useState<Answers>({
    age: "", status: "", location: "",
    subjects: [], freetime: "", flowstate: "",
    workstyle: [], whenwrong: "", problemtypes: [],
    goodat: "", peoplecome: "",
    traits: {}, workenvironments: [], moneyvsmeaning: 5,
    dreamday: "", futureself: "",
    teenname: "", email: "",
  });

  const totalSections = 6;

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (isOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Track quiz_started when the modal opens
  useEffect(() => {
    if (isOpen) trackEvent("quiz_started");
  }, [isOpen]);

  const updateAnswer = useCallback(<K extends keyof Answers>(key: K, val: Answers[K]) => {
    setAnswers((prev) => ({ ...prev, [key]: val }));
  }, []);

  const toggleChip = useCallback((key: "subjects" | "workstyle" | "problemtypes" | "workenvironments", val: string) => {
    setAnswers((prev) => {
      const arr = prev[key] as string[];
      return {
        ...prev,
        [key]: arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val],
      };
    });
  }, []);

  const updateTrait = useCallback((trait: string, val: number) => {
    setAnswers((prev) => ({ ...prev, traits: { ...prev.traits, [trait]: val } }));
  }, []);

  const handleNext = useCallback(async () => {
    if (currentSection < totalSections) {
      setCurrentSection((s) => s + 1);
    } else {
      setStage("loading");
      try {
        const res = await fetch("/api/career-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers, audienceMode }),
        });
        const data = await res.json();
        const matched = data.careers || getFallback();
        setCareers(matched);
        // Fire-and-forget: save + email
        fetch("/api/quiz-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers, audienceMode, careers: matched }),
        }).catch(() => {});
      } catch {
        setCareers(getFallback());
      }
      setStage("results");
      trackEvent("quiz_completed", { audience: audienceMode });
    }
  }, [currentSection, answers, audienceMode]);

  const sendEmail = useCallback(async () => {
    const email = emailInput || answers.email;
    if (!email || !email.includes("@")) return;
    try {
      await fetch("/api/quiz-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: { ...answers, email },
          audienceMode,
          careers,
        }),
      });
    } catch {
      // best-effort
    }
    setEmailSent(true);
  }, [emailInput, answers, audienceMode, careers]);

  const reset = useCallback(() => {
    setStage("audience");
    setCurrentSection(1);
    setCareers([]);
    setEmailSent(false);
    setEmailInput("");
    setAnswers({
      age: "", status: "", location: "",
      subjects: [], freetime: "", flowstate: "",
      workstyle: [], whenwrong: "", problemtypes: [],
      goodat: "", peoplecome: "",
      traits: {}, workenvironments: [], moneyvsmeaning: 5,
      dreamday: "", futureself: "",
      teenname: "", email: "",
    });
  }, []);

  if (!isOpen) return null;

  const pct = Math.round(((currentSection - 1) / totalSections) * 100);
  const isAdult = audienceMode === "adult";
  const teenName = answers.teenname;

  // ── Shared styles ──
  const btnPrimary = "bg-orange hover:bg-orange-dark text-white font-semibold px-6 py-3 rounded-full transition-colors text-sm";
  const btnSecondary = "text-gray-warm hover:text-ink text-sm transition-colors";
  const inputClass = "w-full border border-gray-light rounded-xl px-4 py-3 text-sm font-body focus:outline-none focus:border-orange transition-colors bg-white text-ink placeholder:text-gray-mid";
  const textareaClass = inputClass + " resize-none min-h-24";
  const cardClass = "bg-white border border-gray-light rounded-card p-6 mb-4 shadow-sm";

  const chipClass = (selected: boolean) =>
    `px-4 py-2 rounded-full border text-sm cursor-pointer transition-all select-none ${
      selected
        ? "bg-orange border-orange text-white"
        : "border-gray-light text-charcoal hover:border-orange hover:text-orange bg-white"
    }`;

  const optionCardClass = (selected: boolean) =>
    `p-4 rounded-xl border cursor-pointer transition-all ${
      selected
        ? "border-orange bg-orange-light"
        : "border-gray-light bg-white hover:border-orange"
    }`;

  const bubbleClass = (selected: boolean) =>
    `w-9 h-9 rounded-full border flex items-center justify-center text-xs cursor-pointer transition-all ${
      selected
        ? "bg-orange border-orange text-white font-bold"
        : "border-gray-light text-gray-warm hover:border-orange hover:text-orange"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full lg:max-w-2xl max-h-[92vh] lg:max-h-[88vh] bg-cream rounded-t-3xl lg:rounded-3xl overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-light flex-shrink-0 bg-cream">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-orange uppercase tracking-widest">
              Career Discovery
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-warm hover:text-ink transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">

          {/* AUDIENCE SCREEN */}
          {stage === "audience" && (
            <div className="text-center py-4">
              <h2 className="font-heading font-bold text-2xl lg:text-3xl text-ink mb-3">
                Find the right career.{" "}
                <span className="text-orange">For you or someone you love.</span>
              </h2>
              <p className="text-gray-warm text-sm mb-8 max-w-sm mx-auto">
                This quiz takes 2-3 minutes and generates 10 personalized career
                matches with real salaries. Who is taking it today?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {[
                  {
                    mode: "teen" as const,
                    icon: "🎯",
                    title: "I am a teen exploring my future",
                    desc: "Answer for yourself. Find out what careers match who you actually are.",
                  },
                  {
                    mode: "adult" as const,
                    icon: "🤝",
                    title: "I am an adult helping a teen",
                    desc: "Answer on behalf of a student, child, or mentee. Help them discover what they are built for.",
                  },
                ].map((opt) => (
                  <button
                    key={opt.mode}
                    onClick={() => setAudienceMode(opt.mode)}
                    className={`text-left p-5 rounded-card border-2 transition-all ${
                      audienceMode === opt.mode
                        ? "border-orange bg-orange-light"
                        : "border-gray-light bg-white hover:border-orange"
                    }`}
                  >
                    <span className="text-3xl mb-3 block">{opt.icon}</span>
                    <div className="font-semibold text-ink text-sm mb-1">{opt.title}</div>
                    <div className="text-gray-warm text-xs leading-relaxed">{opt.desc}</div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setStage("survey")}
                className={btnPrimary + " w-full py-4 text-base"}
              >
                {audienceMode === "teen" ? "Discover my career path" : "Discover their career path"} &rarr;
              </button>
              <p className="text-gray-mid text-xs mt-3">Free &middot; No signup required</p>
            </div>
          )}

          {/* SURVEY SCREEN */}
          {stage === "survey" && (
            <div>
              {/* Progress */}
              <div className="mb-6">
                <div className="flex justify-between text-xs mb-2">
                  <span className="font-medium text-orange">
                    Section {currentSection} of {totalSections}: {SECTION_NAMES[currentSection - 1]}
                  </span>
                  <span className="text-gray-mid">{pct}% complete</span>
                </div>
                <div className="bg-gray-light rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-mid to-orange rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Section 1: About You */}
              {currentSection === 1 && (
                <div>
                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 1</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "What is their age range?" : "What is your age range?"}</div>
                    <div className="text-gray-warm text-xs mb-4">This helps us give the most relevant career paths.</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[["under16","Under 16"],["16-18","16 to 18"],["19-22","19 to 22"],["23plus","23 and up"]].map(([val, label]) => (
                        <button key={val} onClick={() => updateAnswer("age", val)} className={optionCardClass(answers.age === val)}>
                          <div className="text-sm font-medium">{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 2</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "Where are they in life right now?" : "Where are you in life right now?"}</div>
                    <div className="text-gray-warm text-xs mb-4">No judgment. Just helps us understand the starting point.</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[["inschool","Still in school"],["justgrad","Just graduated"],["working","Currently working"],["figuringout","Figuring it out"]].map(([val, label]) => (
                        <button key={val} onClick={() => updateAnswer("status", val)} className={optionCardClass(answers.status === val)}>
                          <div className="text-sm font-medium">{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 3</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "What city or region are they in?" : "What city or region are you in?"}</div>
                    <div className="text-gray-warm text-xs mb-4">Used to show accurate local salaries.</div>
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="e.g. Oakland, San Jose, Redwood City..."
                      value={answers.location}
                      onChange={(e) => updateAnswer("location", e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Section 2: What Lights You Up */}
              {currentSection === 2 && (
                <div>
                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 4</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "What subjects do they actually like?" : "What subjects do you actually like?"}</div>
                    <div className="text-gray-warm text-xs mb-4">Pick everything that genuinely interests them, even a little.</div>
                    <div className="flex flex-wrap gap-2">
                      {["Math / numbers","Art / design","Science","Computers / tech","Sports / fitness","Music","Writing / stories","Building things","Cooking / food","Business / money","Helping people","Nature / animals","Health / medicine","Law / justice","Fashion / style","Gaming / esports"].map((item) => {
                        const val = item.toLowerCase().replace(/[^a-z]/g, "");
                        return <button key={val} onClick={() => toggleChip("subjects", val)} className={chipClass(answers.subjects.includes(val))}>{item}</button>;
                      })}
                    </div>
                  </div>

                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 5</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "What do they do in their free time?" : "What do you do in your free time?"}</div>
                    <div className="text-gray-warm text-xs mb-4">What do they actually do when nobody is telling them what to do?</div>
                    <textarea className={textareaClass} placeholder="e.g. Always on YouTube watching people build things. Drawing. Playing basketball. Cooking for family. On my phone looking at sneakers..." value={answers.freetime} onChange={(e) => updateAnswer("freetime", e.target.value)} />
                  </div>

                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 6</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "Have they ever lost track of time doing something?" : "Have you ever lost track of time doing something?"}</div>
                    <div className="text-gray-warm text-xs mb-4">That flow state is a clue. What causes it?</div>
                    <textarea className={textareaClass} placeholder="e.g. Was fixing my cousin's car and 4 hours passed. Drawing. Playing music. Helping my friend figure out a problem..." value={answers.flowstate} onChange={(e) => updateAnswer("flowstate", e.target.value)} />
                  </div>
                </div>
              )}

              {/* Section 3: How You Are Wired */}
              {currentSection === 3 && (
                <div>
                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 7</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "How do they like to work?" : "How do you like to work?"}</div>
                    <div className="text-gray-warm text-xs mb-4">Pick everything that feels right.</div>
                    <div className="flex flex-wrap gap-2">
                      {["Alone","With a small team","Leading others","Behind the scenes","Outside","At a desk / screen","Hands-on / physical","On the move","With customers","In a creative space"].map((item) => {
                        const val = item.toLowerCase().replace(/[^a-z]/g, "");
                        return <button key={val} onClick={() => toggleChip("workstyle", val)} className={chipClass(answers.workstyle.includes(val))}>{item}</button>;
                      })}
                    </div>
                  </div>

                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 8</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "When something goes wrong, what do they do?" : "When something goes wrong, what do you do?"}</div>
                    <div className="text-gray-warm text-xs mb-4">Pick the one that sounds most accurate.</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[["figureout","Figure it out alone","I will find the answer"],["asksomeone","Ask someone","Someone always knows"],["lookit","Look it up","YouTube / Google first"],["pushthrough","Push through","Just keep going"]].map(([val, label, sub]) => (
                        <button key={val} onClick={() => updateAnswer("whenwrong", val)} className={optionCardClass(answers.whenwrong === val)}>
                          <div className="text-sm font-medium">{label}</div>
                          <div className="text-xs text-gray-warm mt-0.5">{sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 9</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "What kind of problems do they like solving?" : "What kind of problems do you like solving?"}</div>
                    <div className="text-gray-warm text-xs mb-4">Pick one or two.</div>
                    <div className="flex flex-wrap gap-2">
                      {["People problems","Technical problems","Creative challenges","Physical / building","Money / strategy","Systems and processes"].map((item) => {
                        const val = item.toLowerCase().replace(/[^a-z]/g, "");
                        return <button key={val} onClick={() => toggleChip("problemtypes", val)} className={chipClass(answers.problemtypes.includes(val))}>{item}</button>;
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Section 4: Your Strengths */}
              {currentSection === 4 && (
                <div>
                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 10</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "What are they genuinely good at?" : "What are you genuinely good at?"}</div>
                    <div className="text-gray-warm text-xs mb-4">Do not be modest. What do people recognize?</div>
                    <textarea className={textareaClass} placeholder="e.g. Fixing things, talking to people, staying calm under pressure, math, making people laugh, organizing..." value={answers.goodat} onChange={(e) => updateAnswer("goodat", e.target.value)} />
                  </div>

                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 11</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "What do people actually come to them for?" : "What do people actually come to you for?"}</div>
                    <div className="text-gray-warm text-xs mb-4">What do friends, family, and classmates ask for help with?</div>
                    <textarea className={textareaClass} placeholder="e.g. Advice. Help with their phone. To talk through problems. To fix things. To understand something..." value={answers.peoplecome} onChange={(e) => updateAnswer("peoplecome", e.target.value)} />
                  </div>
                </div>
              )}

              {/* Section 5: Work Vision */}
              {currentSection === 5 && (
                <div>
                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 12</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "How do these describe them?" : "How do these describe you?"}</div>
                    <div className="text-gray-warm text-xs mb-4">1 = not at all, 5 = totally.</div>
                    <div className="flex flex-col gap-4">
                      {[["creative","Creative"],["problemsolver","Loves solving problems"],["peopleperson","Good with people"],["leader","Likes being in charge"]].map(([trait, label]) => (
                        <div key={trait}>
                          <div className="text-sm font-medium mb-2">{label}</div>
                          <div className="flex gap-2">
                            {[1,2,3,4,5].map((val) => (
                              <button key={val} onClick={() => updateTrait(trait, val)} className={bubbleClass(answers.traits[trait] === val)}>{val}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 13</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "What does their dream work environment look like?" : "What does your dream work environment look like?"}</div>
                    <div className="text-gray-warm text-xs mb-4">Pick everything that appeals.</div>
                    <div className="flex flex-wrap gap-2">
                      {["Outdoors / in nature","In an office","On the road / traveling","From home","On a job site","In a studio or lab","In a store / with customers","Anywhere, I want flexibility"].map((item) => {
                        const val = item.toLowerCase().replace(/[^a-z]/g, "");
                        return <button key={val} onClick={() => toggleChip("workenvironments", val)} className={chipClass(answers.workenvironments.includes(val))}>{item}</button>;
                      })}
                    </div>
                  </div>

                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 14</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "How do they balance money vs. meaning?" : "How do you balance money vs. meaning?"}</div>
                    <div className="text-gray-warm text-xs mb-4">Neither end is wrong.</div>
                    <div className="flex justify-between text-xs text-gray-warm mb-2">
                      <span>Money first</span><span>Mission first</span>
                    </div>
                    <input type="range" min={1} max={10} value={answers.moneyvsmeaning}
                      onChange={(e) => updateAnswer("moneyvsmeaning", parseInt(e.target.value))}
                      className="w-full accent-orange"
                    />
                    <div className="text-center text-sm font-medium text-orange mt-2">
                      {answers.moneyvsmeaning <= 2 ? "Money is the priority"
                        : answers.moneyvsmeaning <= 4 ? "Leaning toward money"
                        : answers.moneyvsmeaning === 5 ? "Balanced, both matter equally"
                        : answers.moneyvsmeaning <= 7 ? "Leaning toward mission"
                        : "Mission is everything"}
                    </div>
                  </div>
                </div>
              )}

              {/* Section 6: Your Future */}
              {currentSection === 6 && (
                <div>
                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Question 15</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "Describe their dream work day." : "Describe your dream work day."}</div>
                    <div className="text-gray-warm text-xs mb-4">Where are they? Who are they with? What are they doing?</div>
                    <textarea className={textareaClass} placeholder="e.g. I wake up and check my schedule. Meeting with my team in the morning, then out on a job site in the afternoon. Done by 5 and my work made something real happen today..." value={answers.dreamday} onChange={(e) => updateAnswer("dreamday", e.target.value)} />
                  </div>

                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Bonus</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "One thing you want their future self to have or feel." : "One thing you want your future self to have or feel."}</div>
                    <div className="text-gray-warm text-xs mb-4">Be real.</div>
                    <textarea className={textareaClass} placeholder="e.g. Financial freedom. Peace. A house. To make my family proud. To feel like I matter. To never worry about money again..." value={answers.futureself} onChange={(e) => updateAnswer("futureself", e.target.value)} />
                  </div>

                  <div className={cardClass}>
                    <div className="text-xs font-medium text-orange uppercase tracking-wide mb-1">Almost done</div>
                    <div className="font-heading font-semibold text-lg mb-1">{isAdult ? "Last thing, who are we doing this for?" : "Last thing, who are we talking about?"}</div>
                    <div className="text-gray-warm text-xs mb-4">We will use this to personalize your results and send them to you.</div>
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-warm uppercase tracking-wide mb-1">{isAdult ? "Teen's first name" : "First name"}</label>
                        <input type="text" className={inputClass} placeholder="e.g. Marcus" value={answers.teenname} onChange={(e) => updateAnswer("teenname", e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-warm uppercase tracking-wide mb-1">Email address</label>
                        <input type="email" className={inputClass} placeholder="your@email.com" value={answers.email} onChange={(e) => updateAnswer("email", e.target.value)} />
                        <p className="text-xs text-gray-mid mt-1">We will email you the full results. No spam, ever.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Survey nav */}
              <div className="flex justify-between items-center mt-4">
                <button
                  onClick={() => currentSection > 1 && setCurrentSection((s) => s - 1)}
                  className={`${btnSecondary} ${currentSection === 1 ? "invisible" : ""}`}
                >
                  &larr; Back
                </button>
                <button onClick={handleNext} className={btnPrimary}>
                  {currentSection === totalSections ? "Get My Careers \u2192" : "Continue \u2192"}
                </button>
              </div>
            </div>
          )}

          {/* LOADING SCREEN */}
          {stage === "loading" && (
            <div className="text-center py-16">
              <div className="w-12 h-12 border-4 border-orange-light border-t-orange rounded-full animate-spin mx-auto mb-6" />
              <h3 className="font-heading font-bold text-xl mb-2">Building your career matches...</h3>
              <p className="text-gray-warm text-sm">This takes about 10 seconds.</p>
              <div className="flex flex-col gap-2 mt-6 max-w-xs mx-auto">
                {["Reading your answers","Matching your strengths to careers","Looking up local salaries","Ranking your top 10"].map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-gray-warm text-xs" style={{ animationDelay: `${i * 0.6}s` }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-mid flex-shrink-0" />
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RESULTS SCREEN */}
          {stage === "results" && (
            <div>
              <div className="text-center mb-6 pt-2">
                <span className="inline-block bg-orange text-white text-xs font-medium uppercase tracking-widest px-3 py-1 rounded-full mb-3">
                  {isAdult && teenName ? `${teenName}'s Career Matches` : "Your Career Matches"}
                </span>
                <h2 className="font-heading font-bold text-2xl text-ink mb-1">
                  {isAdult && teenName ? `${teenName}'s` : "Your"} top{" "}
                  <span className="text-orange">10 careers</span>
                </h2>
                <p className="text-gray-warm text-xs">
                  Based on your answers &middot; Salaries for {answers.location || "your area"}
                </p>
              </div>

              <div className="flex flex-col gap-2 mb-6">
                {careers.map((career, i) => (
                  <div key={i} className="bg-white border border-gray-light rounded-card p-4 flex items-start gap-3 shadow-sm">
                    <span className="text-orange-mid font-bold text-xs flex-shrink-0 w-6 pt-0.5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-semibold text-sm text-ink">{career.title}</div>
                      <div className="text-gray-warm text-xs mt-0.5 leading-relaxed">
                        {career.description}
                        {career.why && <> &middot; {career.why}</>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-sm text-orange-dark">{career.salary}</div>
                      <div className="text-gray-mid text-xs">{answers.location || "local"}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Email capture */}
              {!emailSent ? (
                <div className="bg-white border border-gray-light rounded-card p-5 mb-4 shadow-sm">
                  <div className="text-2xl mb-2">&#128140;</div>
                  <h3 className="font-heading font-semibold text-base mb-1">
                    {isAdult ? "Send these results to them" : "Want these results in your inbox?"}
                  </h3>
                  <p className="text-gray-warm text-xs mb-4 leading-relaxed">
                    We will send all 10 career matches with salaries plus links to download the Ambition app and get started.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      className={inputClass + " flex-1"}
                      placeholder="your@email.com"
                      value={emailInput || answers.email}
                      onChange={(e) => setEmailInput(e.target.value)}
                    />
                    <button onClick={sendEmail} className={btnPrimary + " flex-shrink-0"}>
                      Send
                    </button>
                  </div>
                  <p className="text-gray-mid text-xs mt-2">Your results stay private. We don&apos;t sell your data or send marketing email.</p>
                </div>
              ) : (
                <div className="bg-orange-light border border-orange/20 rounded-card p-4 mb-4 text-center">
                  <p className="text-orange-dark font-medium text-sm">Results sent! Check your inbox. Your future is waiting.</p>
                </div>
              )}

              {/* App CTA */}
              <div className="bg-orange-dark rounded-card p-6 text-white text-center mb-4">
                <h3 className="font-heading font-bold text-lg mb-2">
                  Ready to see what these careers actually feel like?
                </h3>
                <p className="text-white/75 text-sm mb-5 leading-relaxed">
                  The Ambition app puts you inside real career simulations. Try before you commit. Build skills. Figure out what you are really built for.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <a
                    href="https://apps.apple.com/us/app/ambition-shape-your-future/id1557562279"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white text-orange font-semibold text-sm px-5 py-3 rounded-full hover:bg-orange-light transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                    Download for iOS
                  </a>
                  <a
                    href="https://play.google.com/store/apps/details?id=com.theambitionapp.ambitionappRN&pcampaignid=web_share"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white/15 border border-white/40 text-white font-semibold text-sm px-5 py-3 rounded-full hover:bg-white/25 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3.18 23.76c.3.17.64.22.99.14l12.45-7.19-2.78-2.78-10.66 9.83zm-1.81-20.1c-.22.3-.35.7-.35 1.18v18.32c0 .48.13.88.36 1.18l.06.06 10.26-10.26v-.24L1.43 3.6l-.06.06zm20.43 8.83l-2.9-1.68-3.06 3.06 3.06 3.06 2.91-1.69c.83-.48.83-1.27-.01-1.75zM4.17.38L16.62 7.57l-2.78 2.78L3.18.52C3.5.35 3.86.28 4.17.38z"/></svg>
                    Download for Android
                  </a>
                </div>
              </div>

              <button onClick={reset} className="w-full text-gray-warm text-xs py-3 hover:text-ink transition-colors">
                Start over
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
