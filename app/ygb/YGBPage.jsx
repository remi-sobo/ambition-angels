"use client";

import { useState, useEffect, useRef } from "react";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://kzzdtibbwsucloaoqpqa.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// ─── COLORS ─────────────────────────────────────────────────────────────────
const C = {
  black:    "#080808",
  card:     "#111111",
  border:   "#252525",
  gold:     "#FFD700",
  goldMid:  "#C9A800",
  goldDeep: "#7A5800",
  white:    "#F0EAD6",
  muted:    "#888",
};

// ─── SUPABASE HELPERS ────────────────────────────────────────────────────────
const supabase = async (path, method = "GET", body = null) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "return=minimal",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.ok;
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
function KenteDivider() {
  return (
    <div
      style={{
        height: 10,
        width: "100%",
        background: `repeating-linear-gradient(
          90deg,
          ${C.gold}     0px,  ${C.gold}     8px,
          #000          8px,  #000          16px,
          ${C.goldMid}  16px, ${C.goldMid}  24px,
          #000          24px, #000          32px,
          ${C.gold}     32px, ${C.gold}     40px,
          ${C.goldDeep} 40px, ${C.goldDeep} 48px,
          #000          48px, #000          56px
        )`,
      }}
    />
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
      {/* ambient glow */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none",
        background: `radial-gradient(ellipse 70% 50% at 50% 90%, ${C.goldDeep}28 0%, transparent 70%)` }} />

      {/* grain */}
      <div style={{ position:"absolute", inset:0, opacity:0.035, pointerEvents:"none",
        backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />

      <div style={{ position:"absolute", top:0, left:0, right:0 }}><KenteDivider /></div>

      <div style={t}>
        <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(12px,3vw,16px)", letterSpacing:"0.45em", color:C.goldMid, margin:"0 0 8px" }}>
          EAST PALO ALTO PRESENTS
        </p>

        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(80px,20vw,200px)", lineHeight:0.88, color:C.gold,
          textShadow:`0 0 50px ${C.gold}44, 0 0 100px ${C.gold}18`, letterSpacing:"0.02em", margin:0 }}>
          YGB
        </h1>

        <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(16px,4vw,30px)", letterSpacing:"0.3em", color:C.white, margin:"8px 0 20px" }}>
          YOUNG · GIFTED · BLACK
        </p>

        <h2 style={{ fontFamily:"'Permanent Marker',cursive", fontSize:"clamp(40px,11vw,96px)", display:"inline-block",
          color:C.white, lineHeight:1.1, margin:"0 0 28px",
          textShadow:`3px 3px 0 ${C.gold}, 6px 6px 0 ${C.goldMid}, -1px -1px 0 ${C.goldDeep}`,
          transform:"rotate(-2deg)" }}>
          Creators Camp
        </h2>

        <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(16px,3.5vw,26px)", letterSpacing:"0.35em", color:C.gold, margin:"0 0 40px" }}>
          AUGUST 3 – 7, 2025
        </p>

        <div style={{ display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap" }}>
          <Btn onClick={onRegister} gold>REGISTER YOUR CHILD</Btn>
          <Btn onClick={() => document.getElementById("showcase")?.scrollIntoView({behavior:"smooth"})} outline>RSVP FOR SHOWCASE</Btn>
        </div>

        <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:13, letterSpacing:"0.12em", color:C.muted, marginTop:24 }}>
          FREE · AGES 7–12 · LIMITED TO 20 SPOTS · EAST PALO ALTO, CA
        </p>
      </div>

      <div style={{ position:"absolute", bottom:0, left:0, right:0 }}><KenteDivider /></div>
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
    <section style={{ background:"#0e0e0e", padding:"80px 24px" }}>
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
    { icon:"📅", label:"DATES",    val:"Aug 3–7, 2025",      sub:"Monday through Friday" },
    { icon:"⏰", label:"HOURS",    val:"9:30 AM – 3:00 PM",  sub:"Drop-off from 9:00 AM" },
    { icon:"📍", label:"LOCATION", val:"Young Life House",   sub:"1265 Beach St, East Palo Alto" },
    { icon:"💰", label:"COST",     val:"FREE",               sub:"Bring lunch + $100 on Friday" },
    { icon:"👟", label:"AGES",     val:"7 – 12",             sub:"1st through 7th grade" },
    { icon:"🎤", label:"SHOWCASE", val:"Friday, Aug 7",      sub:"1:00 PM — family invited" },
  ];

  return (
    <section style={{ background:C.black, padding:"80px 24px" }}>
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
    <section style={{ background:"#0c0c0c", padding:"0 24px 80px" }}>
      <KenteDivider />
      <div style={{ maxWidth:1100, margin:"48px auto 0" }}>
        <div style={{ textAlign:"center", marginBottom:48 }}>
          <h2 style={{ fontFamily:"'Permanent Marker',cursive", fontSize:"clamp(36px,9vw,80px)",
            color:C.white, display:"inline-block", transform:"rotate(-1.5deg)",
            textShadow:`2px 2px 0 ${C.gold}, 5px 5px 0 ${C.goldMid}`, margin:0 }}>
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
    <section style={{ background:"#0e0e0e", padding:"60px 24px" }}>
      <div style={{ maxWidth:780, margin:"0 auto", textAlign:"center" }}>
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

// ─── REGISTRATION FORM ───────────────────────────────────────────────────────
const STEPS = ["Parent Info","Camper Info","Emergency + Health","Waivers"];

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

function RegistrationForm({ earlyAccess }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const empty = { parent_first_name:"",parent_last_name:"",parent_email:"",parent_phone:"",
    secondary_contact_name:"",secondary_contact_phone:"",secondary_contact_relationship:"",
    camper_first_name:"",camper_last_name:"",camper_dob:"",camper_grade:"",camper_tshirt_size:"",
    emergency_contact_name:"",emergency_contact_phone:"",emergency_contact_relationship:"",
    allergies_medical:"",special_accommodations:"",
    liability_waiver_signed:false,photo_video_release_signed:false,medical_consent_signed:false,
    returning_family:!!earlyAccess, early_access:!!earlyAccess };

  const [form, setForm] = useState(empty);
  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  const validate = () => {
    if (step===0 && (!form.parent_first_name||!form.parent_last_name||!form.parent_email||!form.parent_phone))
      return "Please fill in all required fields.";
    if (step===1 && (!form.camper_first_name||!form.camper_last_name||!form.camper_dob||!form.camper_grade||!form.camper_tshirt_size))
      return "Please fill in all required camper fields.";
    if (step===2 && (!form.emergency_contact_name||!form.emergency_contact_phone||!form.emergency_contact_relationship))
      return "Please complete the emergency contact section.";
    if (step===3 && (!form.liability_waiver_signed||!form.photo_video_release_signed||!form.medical_consent_signed))
      return "You must agree to all three waivers.";
    return "";
  };

  const next = async () => {
    const e = validate();
    if (e) { setErr(e); return; }
    setErr("");
    if (step < 3) { setStep(s => s+1); return; }
    setLoading(true);
    const dob = new Date(form.camper_dob);
    const age = new Date().getFullYear() - dob.getFullYear();
    const ok = await supabase("ygb_registrations", "POST", { ...form, camper_age: age });
    setLoading(false);
    if (ok) setDone(true);
    else setErr("Something went wrong — please try again or email us directly.");
  };

  if (done) return (
    <div style={{ textAlign:"center", padding:"48px 0" }}>
      <div style={{ fontSize:64, marginBottom:20 }}>🎉</div>
      <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(36px,8vw,64px)", color:C.gold, letterSpacing:"0.05em", margin:"0 0 12px" }}>YOU&apos;RE IN!</h3>
      <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:18, color:C.white, marginBottom:8 }}>
        {form.camper_first_name} is registered for YGB Creators Camp 2025.
      </p>
      <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:14, color:C.muted }}>
        Confirmation sent to {form.parent_email}.
      </p>
    </div>
  );

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

      {/* Step 0 */}
      {step===0 && <div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <Field label="Parent First Name" req><Input value={form.parent_first_name} onChange={set("parent_first_name")} /></Field>
          <Field label="Parent Last Name"  req><Input value={form.parent_last_name}  onChange={set("parent_last_name")} /></Field>
        </div>
        <Field label="Email Address" req><Input type="email" value={form.parent_email} onChange={set("parent_email")} placeholder="you@email.com" /></Field>
        <Field label="Phone Number"  req><Input type="tel"   value={form.parent_phone} onChange={set("parent_phone")} placeholder="(650) 555-0000" /></Field>
        <div style={{ borderTop:`1px solid #1e1e1e`, paddingTop:24, marginBottom:8 }}>
          <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:12, letterSpacing:"0.3em", color:"#444", margin:"0 0 16px" }}>SECONDARY CONTACT (OPTIONAL)</p>
          <Field label="Name"><Input value={form.secondary_contact_name} onChange={set("secondary_contact_name")} /></Field>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
            <Field label="Phone"><Input type="tel" value={form.secondary_contact_phone} onChange={set("secondary_contact_phone")} /></Field>
            <Field label="Relationship"><Input value={form.secondary_contact_relationship} onChange={set("secondary_contact_relationship")} placeholder="Grandparent, Aunt..." /></Field>
          </div>
        </div>
        <label style={{ display:"flex", gap:12, alignItems:"center", cursor:"pointer" }}>
          <input type="checkbox" checked={form.returning_family} onChange={e => setForm(p=>({...p,returning_family:e.target.checked}))}
            style={{ accentColor:C.gold, width:18, height:18 }} />
          <span style={{ fontFamily:"'Barlow',sans-serif", fontSize:15, color:"#aaa" }}>We are a returning YGB family</span>
        </label>
      </div>}

      {/* Step 1 */}
      {step===1 && <div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <Field label="Camper First Name" req><Input value={form.camper_first_name} onChange={set("camper_first_name")} /></Field>
          <Field label="Camper Last Name"  req><Input value={form.camper_last_name}  onChange={set("camper_last_name")} /></Field>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <Field label="Date of Birth" req><Input type="date" value={form.camper_dob} onChange={set("camper_dob")} /></Field>
          <Field label="Grade (Fall 2025)" req>
            <Select value={form.camper_grade} onChange={set("camper_grade")}>
              <option value="">Select grade</option>
              {["1st","2nd","3rd","4th","5th","6th","7th"].map(g => <option key={g} value={g}>{g} Grade</option>)}
            </Select>
          </Field>
        </div>
        <Field label="T-Shirt Size" req>
          <Select value={form.camper_tshirt_size} onChange={set("camper_tshirt_size")}>
            <option value="">Select size</option>
            {["Youth XS (2–4)","Youth S (6–8)","Youth M (10–12)","Youth L (14–16)","Youth XL (18–20)","Adult S","Adult M","Adult L"].map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
      </div>}

      {/* Step 2 */}
      {step===2 && <div>
        <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:12, letterSpacing:"0.3em", color:"#444", margin:"0 0 20px" }}>EMERGENCY CONTACT</p>
        <Field label="Emergency Contact Name" req><Input value={form.emergency_contact_name} onChange={set("emergency_contact_name")} /></Field>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <Field label="Phone" req><Input type="tel" value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} /></Field>
          <Field label="Relationship" req><Input value={form.emergency_contact_relationship} onChange={set("emergency_contact_relationship")} placeholder="Parent, Grandparent..." /></Field>
        </div>
        <div style={{ borderTop:`1px solid #1e1e1e`, paddingTop:24, marginTop:8 }}>
          <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:12, letterSpacing:"0.3em", color:"#444", margin:"0 0 20px" }}>HEALTH &amp; ACCOMMODATIONS</p>
          <Field label="Allergies or Medical Conditions">
            <Textarea value={form.allergies_medical} onChange={set("allergies_medical")} placeholder="List any allergies, medications, or conditions staff should know about. Leave blank if none." rows={3} />
          </Field>
          <Field label="Special Accommodations or Notes">
            <Textarea value={form.special_accommodations} onChange={set("special_accommodations")} placeholder="Anything else we should know to set your child up for a great week." rows={3} />
          </Field>
        </div>
      </div>}

      {/* Step 3 */}
      {step===3 && <div>
        <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:15, color:C.muted, margin:"0 0 24px", lineHeight:1.7 }}>
          Please read and agree to all three documents below to complete your registration.
        </p>
        <WaiverBlock field="liability_waiver_signed" form={form} setForm={setForm}
          label="I have read and agree to the Full Release of Liability"
          text="In consideration of my child's participation in YGB Creators Camp (August 3–7, 2025), hosted by Ambition Angels at 1265 Beach Street, East Palo Alto, CA, I hereby release, waive, discharge, and covenant not to sue Ambition Angels, Young Life, StreetCode Academy, their officers, directors, employees, volunteers, and agents from any and all claims, damages, losses, or expenses arising out of or related to my child's participation, including injury, illness, or accident. I acknowledge that voluntary enrollment constitutes acceptance of these risks. This release is binding on me, my heirs, and legal representatives." />
        <WaiverBlock field="photo_video_release_signed" form={form} setForm={setForm}
          label="I agree to the Photo and Video Release"
          text="I grant permission to Ambition Angels and its partners to photograph and/or video record my child during YGB Creators Camp 2025. These materials may be used for educational, promotional, and social media purposes including the Ambition Angels website and Instagram. I understand no compensation will be received and I may request removal of specific content by contacting Ambition Angels directly." />
        <WaiverBlock field="medical_consent_signed" form={form} setForm={setForm}
          label="I agree to the Medical Consent and Emergency Authorization"
          text="I authorize YGB Creators Camp staff to seek emergency medical care for my child if I cannot be reached and a medical professional determines care is necessary. I consent to reasonable first aid on-site. I confirm all medical and allergy information provided is accurate. I release Ambition Angels from liability for medical decisions made in good faith during emergencies when a parent cannot be reached." />
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
            Free camp. 20 spots. Register now.
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
  const set = f => e => setForm(p=>({...p,[f]:e.target.value}));

  const submit = async () => {
    if (!form.name||!form.email||!form.camper_name) return;
    setLoading(true);
    await supabase(
      `ygb_registrations?parent_email=eq.${encodeURIComponent(form.email)}`,
      "PATCH",
      { showcase_attending:true, showcase_guest_count:parseInt(form.guest_count) }
    );
    setLoading(false);
    setDone(true);
  };

  return (
    <section id="showcase" style={{ background:"#0c0c0c", padding:"0 24px 80px" }}>
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
    <footer style={{ background:C.black, padding:"40px 24px", textAlign:"center", borderTop:`1px solid #1a1a1a` }}>
      <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, letterSpacing:"0.3em", color:C.gold, margin:"0 0 8px" }}>
        YGB ACADEMY · CREATORS CAMP 2025
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
    <div style={{ background:C.black, color:C.white, minHeight:"100vh" }}>
      <FontLoader />
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
