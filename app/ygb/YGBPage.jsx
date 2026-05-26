"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";

// ─── COLORS ─────────────────────────────────────────────────────────────────
const C = {
  black:    "#080808",
  card:     "#111111",
  border:   "#252525",
  gold:     "#D4AF37",   // antique / champagne — primary accent
  goldMid:  "#B0892E",   // borders, labels
  goldDeep: "#4D3C14",   // backgrounds, depth
  white:    "#F0EAD6",
  muted:    "#8A887F",
  // Pan-African accents — deep + desaturated, for the Kente weave only.
  red:      "#8E2B2B",
  green:    "#2E5E3A",
};

// ─── FONT LOADER ─────────────────────────────────────────────────────────────
function FontLoader() {
  useEffect(() => {
    if (document.getElementById("ygb-fonts")) return;
    const l = document.createElement("link");
    l.id = "ygb-fonts";
    l.rel = "stylesheet";
    l.href =
      "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Permanent+Marker&family=Barlow+Condensed:wght@400;600;700;900&family=Barlow:wght@400;500;600&display=swap";
    document.head.appendChild(l);
  }, []);
  return null;
}

// ─── KENTE DIVIDER ───────────────────────────────────────────────────────────
// Pan-African weave (gold-dominant with red + green accents). It's punctuation,
// not decoration — it marks the start of a new beat. The faint horizontal lines
// give it a woven, threaded feel rather than flat stripes.
function KenteDivider() {
  return (
    <div
      aria-hidden="true"
      style={{
        height: 9,
        width: "100%",
        backgroundColor: "#0B0B0B",
        borderTop: `1px solid ${C.goldMid}`,
        borderBottom: `1px solid ${C.goldMid}`,
        backgroundImage: `
          repeating-linear-gradient(90deg,
            ${C.gold}  0 3px, transparent 3px 7px,
            ${C.red}   7px 10px, transparent 10px 14px,
            ${C.green} 14px 17px, transparent 17px 21px),
          repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px)`,
      }}
    />
  );
}

// ─── ADINKRA WATERMARK ───────────────────────────────────────────────────────
// Adinkrahene ("chief of adinkra") — concentric circles signifying leadership
// and greatness. Used as a faint background presence, never as an icon.
function AdinkraWatermark({ size = 320, color = C.gold, opacity = 0.05, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      style={{ position: "absolute", pointerEvents: "none", opacity, ...style }}
    >
      <g stroke={color} strokeWidth="2" fill="none">
        <circle cx="50" cy="50" r="46" />
        <circle cx="50" cy="50" r="33" />
        <circle cx="50" cy="50" r="20" />
        <circle cx="50" cy="50" r="8" />
      </g>
    </svg>
  );
}

// ─── STICKY NAV ──────────────────────────────────────────────────────────────
function YgbNav({ onRegister }) {
  const links = [["about","ABOUT"],["details","DETAILS"],["create","CREATE"],["showcase","SHOWCASE"]];
  return (
    <nav style={{ position:"sticky", top:0, zIndex:50, background:C.black,
      borderBottom:`1px solid #161616`, display:"flex", alignItems:"center",
      justifyContent:"space-between", gap:16, padding:"10px 20px", flexWrap:"wrap" }}>
      <span style={{ fontFamily:"'Arial Black','Helvetica Neue',sans-serif", fontWeight:900,
        fontSize:24, color:C.gold, letterSpacing:"0.04em" }}>YGB</span>
      <div style={{ display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
        {links.map(([id,label]) => (
          <a key={id} href={`#${id}`}
            style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, letterSpacing:"0.14em",
              color:C.white, textDecoration:"none", transition:"color 0.15s" }}
            onMouseOver={e => e.currentTarget.style.color = C.gold}
            onMouseOut={e => e.currentTarget.style.color = C.white}>
            {label}
          </a>
        ))}
        <button onClick={onRegister} style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16,
          letterSpacing:"0.14em", background:C.gold, color:C.black, border:"none",
          padding:"9px 22px", cursor:"pointer" }}>
          REGISTER
        </button>
      </div>
    </nav>
  );
}

// ─── HERO ────────────────────────────────────────────────────────────────────
function Hero({ onRegister }) {
  const [in_, setIn] = useState(false);
  useEffect(() => { setTimeout(() => setIn(true), 80); }, []);
  const t = { opacity: in_ ? 1 : 0, transform: in_ ? "translateY(0)" : "translateY(28px)", transition: "all 0.7s ease" };

  return (
    <section
      style={{
        background: C.black,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
        padding: "80px 24px 60px",
      }}
    >
      {/* real community photo, optimized + sat behind a dark, warm wash */}
      <Image src="/images/ygb-hero-2.jpg" alt="YGB Creators Camp campers celebrating" fill priority sizes="100vw"
        style={{ objectFit:"cover", objectPosition:"center 38%" }} />
      <div style={{ position:"absolute", inset:0, pointerEvents:"none",
        background:"linear-gradient(180deg, rgba(8,8,8,0.86) 0%, rgba(8,8,8,0.70) 42%, rgba(8,8,8,0.96) 100%)" }} />

      {/* ambient glow */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none",
        background: `radial-gradient(ellipse 70% 50% at 50% 90%, ${C.goldDeep}33 0%, transparent 70%)` }} />

      {/* grain */}
      <div style={{ position:"absolute", inset:0, opacity:0.02, pointerEvents:"none",
        backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />

      <AdinkraWatermark size={640} color={C.gold} opacity={0.035}
        style={{ top:"50%", left:"50%", transform:"translate(-50%,-50%)" }} />

      <div style={{ ...t, position:"relative" }}>
        <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(12px,3vw,16px)", letterSpacing:"0.45em", color:C.goldMid, margin:"0 0 14px" }}>
          EAST PALO ALTO PRESENTS
        </p>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/ygb-logo-words.png" alt="YGB — Young. Gifted. Black."
          style={{ width:"min(82vw,470px)", height:"auto", margin:"0 auto 18px", display:"block",
            filter:"drop-shadow(0 8px 34px rgba(0,0,0,0.6))" }} />

        <h2 style={{ fontFamily:"'Permanent Marker',cursive", fontSize:"clamp(38px,10vw,86px)", display:"inline-block",
          color:C.white, lineHeight:1.1, margin:"0 0 28px",
          textShadow:"0 2px 18px rgba(0,0,0,0.7)", transform:"rotate(-1.5deg)" }}>
          Creators Camp
        </h2>

        <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(16px,3.5vw,26px)", letterSpacing:"0.35em", color:C.gold, margin:"0 0 40px" }}>
          AUGUST 3 – 7, 2026
        </p>

        <div style={{ display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap" }}>
          <Btn onClick={onRegister} gold>REGISTER YOUR CHILD</Btn>
          <Btn onClick={() => document.getElementById("showcase")?.scrollIntoView({behavior:"smooth"})} outline>RSVP FOR SHOWCASE</Btn>
        </div>

        <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:13, letterSpacing:"0.12em", color:C.muted, marginTop:24 }}>
          FREE · AGES 7–12 · LIMITED TO 20 SPOTS · EAST PALO ALTO, CA
        </p>
      </div>

    </section>
  );
}

// ─── BUTTON ──────────────────────────────────────────────────────────────────
function Btn({ children, onClick, gold, outline, full, disabled }) {
  const [hov, setHov] = useState(false);
  const base = {
    fontFamily:"'Bebas Neue',sans-serif", letterSpacing:"0.15em",
    fontSize:20, padding:"16px 44px", border:"none", cursor: disabled?"default":"pointer",
    transition:"all 0.18s", width: full?"100%":"auto",
  };
  const styles = gold
    ? { ...base, background: hov ? "#fff" : C.gold, color: C.black }
    : outline
    ? { ...base, background: hov ? C.gold : "transparent", color: hov ? C.black : C.gold, border:`2px solid ${C.gold}` }
    : { ...base, background: disabled ? "#444" : (hov ? C.goldMid : C.gold), color: C.black };

  return <button style={styles} onClick={onClick} onMouseOver={() => setHov(true)} onMouseOut={() => setHov(false)} disabled={disabled}>{children}</button>;
}

// ─── ABOUT ───────────────────────────────────────────────────────────────────
function About() {
  return (
    <section id="about" style={{ background:"#0e0e0e", padding:"80px 24px", scrollMarginTop:64 }}>
      <div style={{ maxWidth:860, margin:"0 auto", textAlign:"center" }}>
        <Eyebrow>WHAT IS</Eyebrow>
        <SectionTitle gold>YGB?</SectionTitle>
        <GoldBar />
        <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:"clamp(18px,2.5vw,22px)", color:C.white, lineHeight:1.85, marginBottom:20, opacity:.92 }}>
          Young Gifted &amp; Black is a community of Black families on the Peninsula — building a place where our kids feel{" "}
          <span style={{ color:C.gold, fontWeight:600 }}>invested in, seen, loved,</span> and surrounded by people who want to watch them grow.
        </p>
        <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:"clamp(15px,2vw,18px)", color:C.muted, lineHeight:1.85 }}>
          Creators Camp is where that community gets to make something. This summer, our kids step into the role of creator — using real AI tools to build things that belong to them.
        </p>
      </div>
    </section>
  );
}

// ─── DETAIL CARDS ────────────────────────────────────────────────────────────
function Details() {
  const cards = [
    { icon:"📅", label:"DATES",    val:"Aug 3–7, 2026",      sub:"Monday through Friday" },
    { icon:"⏰", label:"HOURS",    val:"9:30 AM – 3:00 PM",  sub:"Drop-off from 9:00 AM" },
    { icon:"📍", label:"LOCATION", val:"Young Life House",   sub:"1265 Beach St, East Palo Alto" },
    { icon:"💰", label:"COST",     val:"FREE",               sub:"Bring lunch + $100 on Friday" },
    { icon:"👟", label:"AGES",     val:"7 – 12",             sub:"1st through 7th grade" },
    { icon:"🎤", label:"SHOWCASE", val:"Friday, Aug 7",      sub:"1:00 PM — family invited" },
  ];

  return (
    <section id="details" style={{ background:C.black, padding:"80px 24px", scrollMarginTop:64 }}>
      <div style={{ maxWidth:1100, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:48 }}>
          <SectionTitle>CAMP <span style={{ color:C.gold }}>DETAILS</span></SectionTitle>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:18 }}>
          {cards.map((c,i) => <DetailCard key={i} {...c} />)}
        </div>

        <div style={{ marginTop:28, background:`${C.goldDeep}25`, border:`1px solid ${C.goldMid}`,
          borderLeft:`4px solid ${C.gold}`, padding:"20px 24px", display:"flex", gap:16, alignItems:"flex-start" }}>
          <span style={{ fontSize:28, flexShrink:0 }}>💡</span>
          <div>
            <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, letterSpacing:"0.2em", color:C.gold, margin:"0 0 6px" }}>ABOUT THE $100 ON FRIDAY</p>
            <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:15, color:C.white, lineHeight:1.7, margin:0 }}>
              On showcase day, families bring $100 to purchase the products their kids created all week. Every dollar gets split between the campers. They leave with cash they earned from their own work. That&apos;s entrepreneurship in action.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailCard({ icon, label, val, sub }) {
  const [hov, setHov] = useState(false);
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderTop:`3px solid ${hov?C.white:C.gold}`,
      padding:"28px 22px", transition:"border-color 0.2s" }}
      onMouseOver={() => setHov(true)} onMouseOut={() => setHov(false)}>
      <div style={{ fontSize:32, marginBottom:12 }}>{icon}</div>
      <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:12, letterSpacing:"0.35em", color:C.gold, margin:"0 0 6px" }}>{label}</p>
      <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(22px,3vw,30px)", color:C.white, margin:"0 0 4px" }}>{val}</p>
      <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:14, color:C.muted, margin:0 }}>{sub}</p>
    </div>
  );
}

// ─── WHAT THEY'LL CREATE ─────────────────────────────────────────────────────
function WhatTheyCreate() {
  const items = [
    { emoji:"🎵", title:"AI-Generated Songs",  desc:"Write lyrics, pick a vibe, produce a real track. Kids leave with a song they made." },
    { emoji:"📖", title:"Digital Storybooks",  desc:"Build a full illustrated story. AI brings the words and visuals to life." },
    { emoji:"🎨", title:"Original Art",        desc:"Prompt, generate, and customize. Turn ideas into pieces worth showing." },
    { emoji:"💼", title:"Their Own Brand",     desc:"Name, logo concept, pitch. By Friday, every kid has a brand to launch." },
    { emoji:"🤖", title:"Real AI Tools",       desc:"Hands-on time with tools the pros use. No fluff — just creating." },
    { emoji:"💰", title:"Real Money",          desc:"They make it. They sell it. They keep the cash. Entrepreneurship is the point." },
  ];

  return (
    <section id="create" style={{ background:"#0c0c0c", padding:"0 24px 80px", scrollMarginTop:64 }}>
      <KenteDivider />
      <div style={{ maxWidth:1100, margin:"48px auto 0" }}>
        <div style={{ textAlign:"center", marginBottom:48 }}>
          <h2 style={{ fontFamily:"'Permanent Marker',cursive", fontSize:"clamp(36px,9vw,78px)",
            color:C.white, display:"inline-block", transform:"rotate(-1deg)",
            textShadow:"0 2px 16px rgba(0,0,0,0.6)", margin:0 }}>
            What They&apos;ll Create
          </h2>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(290px,1fr))", gap:18 }}>
          {items.map((item,i) => <CreateCard key={i} {...item} />)}
        </div>
      </div>
      <div style={{ marginTop:64 }}><KenteDivider /></div>
    </section>
  );
}

function CreateCard({ emoji, title, desc }) {
  const [hov, setHov] = useState(false);
  return (
    <div style={{ background:C.card, border:`1px solid ${hov?C.gold:C.border}`, padding:28,
      position:"relative", overflow:"hidden", transition:"border-color 0.2s", cursor:"default" }}
      onMouseOver={() => setHov(true)} onMouseOut={() => setHov(false)}>
      <div style={{ position:"absolute", top:0, right:0, width:60, height:60, background:`${C.gold}06`, borderBottomLeftRadius:60 }} />
      <div style={{ fontSize:38, marginBottom:14 }}>{emoji}</div>
      <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:"0.05em", color:C.gold, margin:"0 0 8px" }}>{title}</p>
      <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:15, color:"#bbb", lineHeight:1.65, margin:0 }}>{desc}</p>
    </div>
  );
}

// ─── PARTNERSHIP ─────────────────────────────────────────────────────────────
function Partnership() {
  return (
    <section style={{ background:"#0e0e0e", padding:"60px 24px", position:"relative", overflow:"hidden" }}>
      <AdinkraWatermark size={360} color={C.gold} opacity={0.05}
        style={{ top:"50%", right:-90, transform:"translateY(-50%)" }} />
      <div style={{ maxWidth:780, margin:"0 auto", textAlign:"center", position:"relative" }}>
        <Eyebrow>IN PARTNERSHIP WITH</Eyebrow>
        <SectionTitle>StreetCode Academy</SectionTitle>
        <GoldBar />
        <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:17, color:C.muted, lineHeight:1.85 }}>
          StreetCode Academy is bringing four instructors and a full fleet of computers to power the camp&apos;s AI curriculum. They&apos;ve been doing this work in Black and brown communities for years — and this summer, they&apos;re bringing it directly to East Palo Alto.
        </p>
      </div>
    </section>
  );
}

// ─── FORM PRIMITIVES ─────────────────────────────────────────────────────────
const STEPS = ["Parent Info", "Campers", "Emergency Contact", "Waivers"];
const GRADES = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];
const TSHIRT_SIZES = [
  "Youth XS (2–4)", "Youth S (6–8)", "Youth M (10–12)", "Youth L (14–16)",
  "Youth XL (18–20)", "Adult S", "Adult M", "Adult L",
];
const MAX_CAMPERS = 4;

const iStyle = {
  width:"100%", boxSizing:"border-box",
  background:"#181818", border:`1px solid #333`,
  color:C.white, padding:"12px 16px",
  fontFamily:"'Barlow',sans-serif", fontSize:16,
  outline:"none", transition:"border-color 0.2s",
};

function Field({ label, req, children }) {
  return (
    <div style={{ marginBottom:20 }}>
      <label style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:12, letterSpacing:"0.2em", color:C.gold, display:"block", marginBottom:6 }}>
        {label}{req && <span style={{ color:"#f55" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type="text", placeholder }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={iStyle}
      onFocus={e => e.target.style.borderColor = C.gold}
      onBlur={e  => e.target.style.borderColor = "#333"} />
  );
}

function Select({ value, onChange, children }) {
  return (
    <select value={value} onChange={onChange} style={{ ...iStyle, cursor:"pointer" }}
      onFocus={e => e.target.style.borderColor = C.gold}
      onBlur={e  => e.target.style.borderColor = "#333"}>
      {children}
    </select>
  );
}

function Textarea({ value, onChange, placeholder, rows=4 }) {
  return (
    <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
      style={{ ...iStyle, resize:"vertical" }}
      onFocus={e => e.target.style.borderColor = C.gold}
      onBlur={e  => e.target.style.borderColor = "#333"} />
  );
}

function WaiverBlock({ field, form, setForm, label, text }) {
  const signed = form[field];
  return (
    <div style={{ background:"#111", border:`1px solid #333`, borderLeft:`3px solid ${signed?C.gold:"#333"}`,
      padding:"20px 20px 16px", marginBottom:16, transition:"border-color 0.2s" }}>
      <div style={{ fontFamily:"'Barlow',sans-serif", fontSize:13, color:"#666", lineHeight:1.75,
        marginBottom:16, maxHeight:120, overflowY:"auto", paddingRight:6 }}>{text}</div>
      <label style={{ display:"flex", gap:12, alignItems:"flex-start", cursor:"pointer" }}>
        <input type="checkbox" checked={signed} onChange={e => setForm(p => ({ ...p, [field]:e.target.checked }))}
          style={{ marginTop:2, accentColor:C.gold, width:18, height:18, flexShrink:0 }} />
        <span style={{ fontFamily:"'Barlow',sans-serif", fontSize:15, color:C.white }}>{label}</span>
      </label>
    </div>
  );
}

// ─── REGISTRATION FORM ───────────────────────────────────────────────────────
const emptyCamper = () => ({
  camper_first_name:"", camper_last_name:"", camper_dob:"",
  camper_grade:"", camper_tshirt_size:"", allergies_medical:"", special_accommodations:"",
});

function RegistrationForm({ earlyAccess }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [results, setResults] = useState([]);

  const [shared, setShared] = useState({
    parent_first_name:"", parent_last_name:"", parent_email:"", parent_phone:"",
    secondary_contact_name:"", secondary_contact_phone:"", secondary_contact_relationship:"",
    emergency_contact_name:"", emergency_contact_phone:"", emergency_contact_relationship:"",
    liability_waiver_signed:false, photo_video_release_signed:false, medical_consent_signed:false,
    returning_family:!!earlyAccess, early_access:!!earlyAccess,
  });
  const [campers, setCampers] = useState([emptyCamper()]);

  const setS = f => e => setShared(p => ({ ...p, [f]: e.target.value }));
  const updateCamper = (i, f) => e =>
    setCampers(p => p.map((c, idx) => (idx === i ? { ...c, [f]: e.target.value } : c)));
  const addCamper = () => setCampers(p => (p.length < MAX_CAMPERS ? [...p, emptyCamper()] : p));
  const removeCamper = i => setCampers(p => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));

  const validate = () => {
    if (step===0 && (!shared.parent_first_name||!shared.parent_last_name||!shared.parent_email||!shared.parent_phone))
      return "Please fill in all required parent fields.";
    if (step===1) {
      for (let i=0;i<campers.length;i++) {
        const c = campers[i];
        if (!c.camper_first_name||!c.camper_last_name||!c.camper_dob||!c.camper_grade||!c.camper_tshirt_size)
          return `Please complete all required fields for Camper ${i+1}.`;
      }
    }
    if (step===2 && (!shared.emergency_contact_name||!shared.emergency_contact_phone||!shared.emergency_contact_relationship))
      return "Please complete the emergency contact section.";
    if (step===3 && (!shared.liability_waiver_signed||!shared.photo_video_release_signed||!shared.medical_consent_signed))
      return "You must agree to all three waivers.";
    return "";
  };

  const next = async () => {
    const e = validate();
    if (e) { setErr(e); return; }
    setErr("");
    if (step < 3) { setStep(s => s+1); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/ygb/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...shared, campers }),
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      if (res.ok) { setResults(data.results || []); setDone(true); }
      else setErr(data.error || "Something went wrong — please try again or email us directly.");
    } catch {
      setLoading(false);
      setErr("Something went wrong — please try again or email us directly.");
    }
  };

  if (done) {
    const allConfirmed = results.every(r => r.status === "confirmed");
    const plural = results.length > 1;
    return (
      <div style={{ textAlign:"center", padding:"48px 0" }}>
        <div style={{ fontSize:64, marginBottom:20 }}>{allConfirmed ? "🎉" : "🙌"}</div>
        <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(36px,8vw,64px)", color:C.gold, letterSpacing:"0.05em", margin:"0 0 18px" }}>
          {allConfirmed ? (plural ? "THEY'RE IN!" : "YOU'RE IN!") : "YOU'RE REGISTERED!"}
        </h3>
        <div style={{ maxWidth:420, margin:"0 auto 20px" }}>
          {results.map((r,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
              borderBottom:`1px solid #1e1e1e`, padding:"12px 0" }}>
              <span style={{ fontFamily:"'Barlow',sans-serif", fontSize:17, color:C.white }}>{r.name}</span>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", letterSpacing:"0.12em", fontSize:14,
                color: r.status === "confirmed" ? C.gold : "#bbb" }}>
                {r.status === "confirmed" ? "✓ CONFIRMED" : "WAITLISTED"}
              </span>
            </div>
          ))}
        </div>
        <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:16, color:C.white, marginBottom:8 }}>
          {allConfirmed
            ? `Registered for YGB Creators Camp 2026.`
            : `The camp is filling up — any waitlisted campers will be contacted the moment a spot opens.`}
        </p>
        <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:14, color:C.muted }}>
          We&apos;ll follow up at {shared.parent_email}.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Progress */}
      <div style={{ display:"flex", gap:4, marginBottom:36 }}>
        {STEPS.map((s,i) => (
          <div key={i} style={{ flex:1 }}>
            <div style={{ height:4, background: i<=step ? C.gold : "#2a2a2a", transition:"background 0.3s" }} />
          </div>
        ))}
      </div>
      <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:12, letterSpacing:"0.3em", color:C.gold, margin:"0 0 28px" }}>
        STEP {step+1} OF 4 — {STEPS[step].toUpperCase()}
      </p>

      {/* Step 0 — Parent */}
      {step===0 && <div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <Field label="Parent First Name" req><Input value={shared.parent_first_name} onChange={setS("parent_first_name")} /></Field>
          <Field label="Parent Last Name"  req><Input value={shared.parent_last_name}  onChange={setS("parent_last_name")} /></Field>
        </div>
        <Field label="Email Address" req><Input type="email" value={shared.parent_email} onChange={setS("parent_email")} placeholder="you@email.com" /></Field>
        <Field label="Phone Number"  req><Input type="tel"   value={shared.parent_phone} onChange={setS("parent_phone")} placeholder="(650) 555-0000" /></Field>
        <div style={{ borderTop:`1px solid #1e1e1e`, paddingTop:24, marginBottom:8 }}>
          <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:12, letterSpacing:"0.3em", color:"#444", margin:"0 0 16px" }}>SECONDARY CONTACT (OPTIONAL)</p>
          <Field label="Name"><Input value={shared.secondary_contact_name} onChange={setS("secondary_contact_name")} /></Field>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
            <Field label="Phone"><Input type="tel" value={shared.secondary_contact_phone} onChange={setS("secondary_contact_phone")} /></Field>
            <Field label="Relationship"><Input value={shared.secondary_contact_relationship} onChange={setS("secondary_contact_relationship")} placeholder="Grandparent, Aunt..." /></Field>
          </div>
        </div>
        <label style={{ display:"flex", gap:12, alignItems:"center", cursor:"pointer" }}>
          <input type="checkbox" checked={shared.returning_family} onChange={e => setShared(p=>({...p,returning_family:e.target.checked}))}
            style={{ accentColor:C.gold, width:18, height:18 }} />
          <span style={{ fontFamily:"'Barlow',sans-serif", fontSize:15, color:"#aaa" }}>We are a returning YGB family</span>
        </label>
      </div>}

      {/* Step 1 — Campers (one or more) */}
      {step===1 && <div>
        <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:14, color:C.muted, margin:"0 0 24px", lineHeight:1.6 }}>
          Registering more than one child? Add each of them here — you only fill out the parent, emergency, and waiver sections once.
        </p>
        {campers.map((c,i) => (
          <div key={i} style={{ marginBottom:24,
            paddingBottom: i < campers.length-1 ? 24 : 0,
            borderBottom: i < campers.length-1 ? `1px solid #1e1e1e` : "none" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, letterSpacing:"0.3em", color:C.gold, margin:0 }}>
                CAMPER {i+1}
              </p>
              {campers.length > 1 && (
                <button onClick={() => removeCamper(i)} style={{ background:"none", border:"none", color:C.muted,
                  fontFamily:"'Bebas Neue',sans-serif", fontSize:12, letterSpacing:"0.15em", cursor:"pointer" }}>
                  ✕ REMOVE
                </button>
              )}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
              <Field label="Camper First Name" req><Input value={c.camper_first_name} onChange={updateCamper(i,"camper_first_name")} /></Field>
              <Field label="Camper Last Name"  req><Input value={c.camper_last_name}  onChange={updateCamper(i,"camper_last_name")} /></Field>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
              <Field label="Date of Birth" req><Input type="date" value={c.camper_dob} onChange={updateCamper(i,"camper_dob")} /></Field>
              <Field label="Grade (Fall 2026)" req>
                <Select value={c.camper_grade} onChange={updateCamper(i,"camper_grade")}>
                  <option value="">Select grade</option>
                  {GRADES.map(g => <option key={g} value={g}>{g} Grade</option>)}
                </Select>
              </Field>
            </div>
            <Field label="T-Shirt Size" req>
              <Select value={c.camper_tshirt_size} onChange={updateCamper(i,"camper_tshirt_size")}>
                <option value="">Select size</option>
                {TSHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Allergies or Medical Conditions">
              <Textarea value={c.allergies_medical} onChange={updateCamper(i,"allergies_medical")} placeholder="List any allergies, medications, or conditions staff should know about. Leave blank if none." rows={2} />
            </Field>
            <Field label="Special Accommodations or Notes">
              <Textarea value={c.special_accommodations} onChange={updateCamper(i,"special_accommodations")} placeholder="Anything else we should know to set your child up for a great week." rows={2} />
            </Field>
          </div>
        ))}
        {campers.length < MAX_CAMPERS && (
          <button onClick={addCamper} style={{ width:"100%", background:"transparent",
            border:`1px dashed ${C.goldMid}`, color:C.gold, fontFamily:"'Bebas Neue',sans-serif",
            fontSize:16, letterSpacing:"0.15em", padding:"14px", cursor:"pointer", marginTop:4 }}>
            + ADD ANOTHER CHILD
          </button>
        )}
      </div>}

      {/* Step 2 — Emergency contact (shared) */}
      {step===2 && <div>
        <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:12, letterSpacing:"0.3em", color:"#444", margin:"0 0 20px" }}>EMERGENCY CONTACT</p>
        <Field label="Emergency Contact Name" req><Input value={shared.emergency_contact_name} onChange={setS("emergency_contact_name")} /></Field>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <Field label="Phone" req><Input type="tel" value={shared.emergency_contact_phone} onChange={setS("emergency_contact_phone")} /></Field>
          <Field label="Relationship" req><Input value={shared.emergency_contact_relationship} onChange={setS("emergency_contact_relationship")} placeholder="Parent, Grandparent..." /></Field>
        </div>
        <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:13, color:C.muted, marginTop:4 }}>
          This emergency contact applies to {campers.length > 1 ? "all campers" : "your camper"} listed in this registration.
        </p>
      </div>}

      {/* Step 3 — Waivers (shared) */}
      {step===3 && <div>
        <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:15, color:C.muted, margin:"0 0 24px", lineHeight:1.7 }}>
          Please read and agree to all three documents below. These cover {campers.length > 1 ? "every child" : "your child"} in this registration.
        </p>
        <WaiverBlock field="liability_waiver_signed" form={shared} setForm={setShared}
          label="I have read and agree to the Full Release of Liability"
          text="In consideration of my child(ren)'s participation in YGB Creators Camp (August 3–7, 2026), hosted by Ambition Angels at 1265 Beach Street, East Palo Alto, CA, I hereby release, waive, discharge, and covenant not to sue Ambition Angels, Young Life, StreetCode Academy, their officers, directors, employees, volunteers, and agents from any and all claims, damages, losses, or expenses arising out of or related to my child(ren)'s participation, including injury, illness, or accident. I acknowledge that voluntary enrollment constitutes acceptance of these risks. This release is binding on me, my heirs, and legal representatives." />
        <WaiverBlock field="photo_video_release_signed" form={shared} setForm={setShared}
          label="I agree to the Photo and Video Release"
          text="I grant permission to Ambition Angels and its partners to photograph and/or video record my child(ren) during YGB Creators Camp 2026. These materials may be used for educational, promotional, and social media purposes including the Ambition Angels website and Instagram. I understand no compensation will be received and I may request removal of specific content by contacting Ambition Angels directly." />
        <WaiverBlock field="medical_consent_signed" form={shared} setForm={setShared}
          label="I agree to the Medical Consent and Emergency Authorization"
          text="I authorize YGB Creators Camp staff to seek emergency medical care for my child(ren) if I cannot be reached and a medical professional determines care is necessary. I consent to reasonable first aid on-site. I confirm all medical and allergy information provided is accurate. I release Ambition Angels from liability for medical decisions made in good faith during emergencies when a parent cannot be reached." />
      </div>}

      {err && <div style={{ background:"#f5444418", border:"1px solid #f54444", color:"#ff8888",
        fontFamily:"'Barlow',sans-serif", fontSize:14, padding:"12px 16px", marginBottom:16 }}>{err}</div>}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
        {step>0
          ? <button onClick={() => { setErr(""); setStep(s=>s-1); }}
              style={{ background:"transparent", border:`1px solid #444`, color:"#888",
                fontFamily:"'Bebas Neue',sans-serif", fontSize:16, letterSpacing:"0.15em",
                padding:"14px 28px", cursor:"pointer" }}>← BACK</button>
          : <span />}
        <Btn onClick={next} disabled={loading}>
          {loading ? "SUBMITTING..." : step===3 ? "COMPLETE REGISTRATION →" : "NEXT →"}
        </Btn>
      </div>
    </div>
  );
}

function RegistrationSection({ earlyAccess, formRef }) {
  return (
    <section id="registration" ref={formRef} style={{ background:C.black, padding:"80px 24px" }}>
      <div style={{ maxWidth:700, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:48 }}>
          <SectionTitle>REGISTER YOUR <span style={{ color:C.gold }}>CREATOR</span></SectionTitle>
          <GoldBar />
          <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:16, color:C.muted }}>
            Free camp. 20 spots. Got more than one kid? Add them all in one go.
          </p>
          {earlyAccess && (
            <div style={{ display:"inline-block", background:`${C.gold}18`, border:`1px solid ${C.gold}`,
              color:C.gold, fontFamily:"'Bebas Neue',sans-serif", fontSize:13, letterSpacing:"0.2em",
              padding:"6px 16px", marginTop:12 }}>⭐ EARLY ACCESS — RETURNING YGB FAMILY</div>
          )}
        </div>
        <RegistrationForm earlyAccess={earlyAccess} />
      </div>
    </section>
  );
}

// ─── SHOWCASE RSVP ───────────────────────────────────────────────────────────
function ShowcaseRSVP() {
  const [form, setForm] = useState({ name:"", email:"", camper_name:"", guest_count:"2" });
  const [done, setDone]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const set = f => e => setForm(p=>({...p,[f]:e.target.value}));

  const submit = async () => {
    if (!form.name||!form.email||!form.camper_name) { setErr("Please fill in all fields."); return; }
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/ygb/showcase-rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, guest_count: form.guest_count, name: form.name, camper_name: form.camper_name }),
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      if (res.ok) setDone(true);
      else setErr(data.error || "Something went wrong. Please try again.");
    } catch {
      setLoading(false);
      setErr("Something went wrong. Please try again.");
    }
  };

  return (
    <section id="showcase" style={{ background:"#0c0c0c", padding:"0 24px 80px", scrollMarginTop:64 }}>
      <KenteDivider />
      <div style={{ maxWidth:580, margin:"64px auto 0", textAlign:"center" }}>
        <Eyebrow>FRIDAY · AUGUST 7 · 1:00 PM</Eyebrow>
        <SectionTitle gold>FRIDAY SHOWCASE</SectionTitle>
        <GoldBar />
        <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:16, color:C.muted, lineHeight:1.85, marginBottom:40 }}>
          Come see what your kids built. Buy their products. Celebrate what they made. It&apos;s a showcase, a market, and a send-off all in one.
          <br /><br />
          <span style={{ color:C.gold }}>Bring $100 per camper.</span> All proceeds go directly to the kids.
        </p>
        {done
          ? <div style={{ padding:"40px 0" }}>
              <div style={{ fontSize:52, marginBottom:16 }}>🎊</div>
              <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:C.gold, margin:"0 0 8px" }}>SEE YOU FRIDAY!</p>
              <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:15, color:C.muted }}>You&apos;re on the list.</p>
            </div>
          : <div style={{ textAlign:"left" }}>
              <Field label="Your Name" req><Input value={form.name} onChange={set("name")} /></Field>
              <Field label="Email (must match registration)" req><Input type="email" value={form.email} onChange={set("email")} /></Field>
              <Field label="Camper's Name" req><Input value={form.camper_name} onChange={set("camper_name")} /></Field>
              <Field label="Number of guests (including yourself)">
                <Select value={form.guest_count} onChange={set("guest_count")}>
                  {["1","2","3","4","5","6+"].map(n => <option key={n} value={n}>{n} guest{n!=="1"?"s":""}</option>)}
                </Select>
              </Field>
              {err && <div style={{ background:"#f5444418", border:"1px solid #f54444", color:"#ff8888",
                fontFamily:"'Barlow',sans-serif", fontSize:14, padding:"12px 16px", marginBottom:16 }}>{err}</div>}
              <Btn onClick={submit} full disabled={loading}>
                {loading ? "SAVING..." : "RSVP FOR SHOWCASE →"}
              </Btn>
            </div>
        }
      </div>
      <div style={{ marginTop:64 }}><KenteDivider /></div>
    </section>
  );
}

// ─── WHAT TO BRING ───────────────────────────────────────────────────────────
function WhatToBring() {
  const list = [
    { e:"🥪", t:"Lunch every day — camp does not provide meals" },
    { e:"💧", t:"Water bottle" },
    { e:"🎒", t:"A backpack or bag for their stuff" },
    { e:"💵", t:"$100 cash on Friday, August 7 (Showcase Day)" },
    { e:"⚡", t:"Energy, creativity, and a willingness to try things" },
  ];
  return (
    <section style={{ background:"#0e0e0e", padding:"60px 24px" }}>
      <div style={{ maxWidth:680, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <SectionTitle>WHAT TO <span style={{ color:C.gold }}>BRING</span></SectionTitle>
        </div>
        {list.map((item,i) => (
          <div key={i} style={{ display:"flex", gap:16, alignItems:"center",
            padding:"18px 0", borderBottom:`1px solid #1e1e1e` }}>
            <span style={{ fontSize:28, flexShrink:0 }}>{item.e}</span>
            <span style={{ fontFamily:"'Barlow',sans-serif", fontSize:17, color:"#ccc" }}>{item.t}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── FOOTER ──────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background:C.black, padding:"48px 24px 40px", textAlign:"center", borderTop:`1px solid #1a1a1a` }}>
      <div style={{ display:"flex", justifyContent:"center", marginBottom:18 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/ygb-logo-words.png" alt="YGB — Young. Gifted. Black."
          style={{ width:170, height:"auto", display:"block" }} />
      </div>
      <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:13, letterSpacing:"0.3em", color:C.gold, margin:"0 0 8px" }}>
        AUGUST 3 – 7, 2026
      </p>
      <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:13, color:"#3a3a3a", margin:0 }}>
        Hosted by Ambition Angels · East Palo Alto, CA · ambitionangels.org
      </p>
      <div style={{ marginTop:16 }}><KenteDivider /></div>
    </footer>
  );
}

// ─── SHARED PRIMITIVES ───────────────────────────────────────────────────────
function SectionTitle({ children, gold }) {
  return (
    <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(36px,8vw,70px)",
      color: gold ? C.gold : C.white, letterSpacing:"0.04em", margin:0 }}>
      {children}
    </h2>
  );
}
function Eyebrow({ children }) {
  return (
    <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:13, letterSpacing:"0.4em",
      color:C.goldMid, margin:"0 0 8px" }}>{children}</p>
  );
}
function GoldBar() {
  return <div style={{ width:60, height:4, background:C.gold, margin:"16px auto 28px" }} />;
}

// ─── PAGE EXPORT ─────────────────────────────────────────────────────────────
// earlyAccess={true} when served via the private link for returning families
export default function YGBPage({ earlyAccess = false }) {
  const formRef = useRef(null);
  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior:"smooth", block:"start" });

  return (
    <div style={{ background:C.black, color:C.white, minHeight:"100vh", scrollBehavior:"smooth" }}>
      <FontLoader />
      <YgbNav onRegister={scrollToForm} />
      <Hero onRegister={scrollToForm} />
      <About />
      <Details />
      <WhatTheyCreate />
      <Partnership />
      <RegistrationSection earlyAccess={earlyAccess} formRef={formRef} />
      <ShowcaseRSVP />
      <WhatToBring />
      <Footer />
    </div>
  );
}
