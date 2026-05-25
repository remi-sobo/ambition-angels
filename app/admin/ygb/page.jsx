"use client";

import { useState, useEffect } from "react";
import { YgbCrown } from "@/app/ygb/YgbLogo";

const CAPACITY = 20;

const CAMP_DAYS = [
  { date: "2025-08-03", label: "Mon Aug 3" },
  { date: "2025-08-04", label: "Tue Aug 4" },
  { date: "2025-08-05", label: "Wed Aug 5" },
  { date: "2025-08-06", label: "Thu Aug 6" },
  { date: "2025-08-07", label: "Fri Aug 7" },
];

// ─── COLORS ───────────────────────────────────────────────────────────────────
const C = {
  bg:     "#080808", panel: "#111", card:"#161616",
  border: "#222",    gold:  "#FFD700", goldDim:"#7A5800",
  white:  "#F0EAD6", muted: "#666",   green:"#22c55e",
  red:    "#ef4444",
};

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
function exportCSV(rows) {
  const cols = [
    "camper_first_name","camper_last_name","camper_dob","camper_age","camper_grade","camper_tshirt_size",
    "parent_first_name","parent_last_name","parent_email","parent_phone",
    "emergency_contact_name","emergency_contact_phone","emergency_contact_relationship",
    "allergies_medical","special_accommodations",
    "returning_family","status","showcase_attending","showcase_guest_count",
    "created_at",
  ];
  const header = cols.join(",");
  const lines = rows.map(r =>
    cols.map(c => {
      const v = r[c] ?? "";
      return typeof v === "string" && (v.includes(",") || v.includes('"'))
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    }).join(",")
  );
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `ygb-registrations-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ─── SHARED UI ────────────────────────────────────────────────────────────────
const Tab = ({ label, active, count, onClick }) => (
  <button onClick={onClick} style={{
    background: active ? C.gold : "transparent",
    color: active ? C.bg : C.muted,
    fontFamily: "'Bebas Neue',sans-serif",
    fontSize: 15, letterSpacing: "0.15em",
    padding: "10px 24px", border: "none", cursor: "pointer",
    borderBottom: active ? `none` : `2px solid ${C.border}`,
    transition: "all 0.15s",
  }}>
    {label}
    {count != null && (
      <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.7 }}>({count})</span>
    )}
  </button>
);

const Badge = ({ text, color }) => (
  <span style={{
    background: `${color}22`, border: `1px solid ${color}`, color,
    fontFamily: "'Bebas Neue',sans-serif", fontSize: 11, letterSpacing: "0.15em",
    padding: "2px 8px",
  }}>{text}</span>
);

// ─── ROSTER TAB ──────────────────────────────────────────────────────────────
function RosterTab({ regs }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const confirmed = regs.filter(r => r.status === "confirmed").length;

  const filtered = regs.filter(r => {
    const q = search.toLowerCase();
    return !q || r.camper_first_name?.toLowerCase().includes(q) ||
      r.camper_last_name?.toLowerCase().includes(q) ||
      r.parent_email?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div style={{ display:"flex", gap:12, marginBottom:20, alignItems:"center", flexWrap:"wrap" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          style={{ flex:1, minWidth:200, background:"#1a1a1a", border:`1px solid ${C.border}`,
            color:C.white, padding:"10px 14px", fontFamily:"'Barlow',sans-serif", fontSize:14,
            outline:"none" }}
        />
        <button onClick={() => exportCSV(regs)} style={{
          background:C.gold, color:C.bg, fontFamily:"'Bebas Neue',sans-serif",
          fontSize:14, letterSpacing:"0.15em", padding:"10px 24px", border:"none", cursor:"pointer" }}>
          EXPORT CSV
        </button>
        <span style={{ fontFamily:"'Barlow',sans-serif", fontSize:13, color:C.muted }}>
          {confirmed} / {CAPACITY} confirmed · {regs.length} total
        </span>
      </div>

      {/* Capacity bar */}
      <div style={{ marginBottom:24 }}>
        <div style={{ height:6, background:"#222", borderRadius:0 }}>
          <div style={{ height:6, width:`${Math.min(100,(confirmed/CAPACITY)*100)}%`,
            background: confirmed >= CAPACITY ? C.red : C.gold, transition:"width 0.4s" }} />
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"'Barlow',sans-serif", fontSize:14 }}>
          <thead>
            <tr style={{ borderBottom:`2px solid ${C.gold}` }}>
              {["Camper","Age / Grade","T-Shirt","Parent / Email","Allergies","Status","Showcase"].map(h => (
                <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontFamily:"'Bebas Neue',sans-serif",
                  fontSize:11, letterSpacing:"0.2em", color:C.gold, whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r,i) => (
              <tr key={r.id} onClick={() => setSelected(r)} style={{
                background: i%2===0 ? C.panel : C.card,
                borderBottom:`1px solid ${C.border}`,
                cursor:"pointer",
              }}
                onMouseOver={e => e.currentTarget.style.background = `${C.gold}12`}
                onMouseOut={e => e.currentTarget.style.background = i%2===0 ? C.panel : C.card}
              >
                <td style={{ padding:"12px", color:C.white, whiteSpace:"nowrap" }}>
                  {r.camper_first_name} {r.camper_last_name}
                  {r.returning_family && <span style={{ marginLeft:6, color:C.gold, fontSize:11 }}>★</span>}
                </td>
                <td style={{ padding:"12px", color:C.muted }}>{r.camper_age} / {r.camper_grade}</td>
                <td style={{ padding:"12px", color:C.muted }}>{r.camper_tshirt_size}</td>
                <td style={{ padding:"12px" }}>
                  <div style={{ color:C.white }}>{r.parent_first_name} {r.parent_last_name}</div>
                  <div style={{ color:C.muted, fontSize:12 }}>{r.parent_email}</div>
                </td>
                <td style={{ padding:"12px", color: r.allergies_medical ? C.red : "#333", fontSize:12, maxWidth:140 }}>
                  {r.allergies_medical || "—"}
                </td>
                <td style={{ padding:"12px" }}>
                  <Badge text={r.status} color={r.status==="confirmed"?C.green:r.status==="waitlisted"?C.gold:C.red} />
                </td>
                <td style={{ padding:"12px", textAlign:"center" }}>
                  {r.showcase_attending ? <span style={{ color:C.green }}>✓ {r.showcase_guest_count}g</span> : <span style={{ color:"#333" }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:14, color:C.muted, textAlign:"center", padding:"40px 0" }}>
            No registrations yet.
          </p>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <div style={{ position:"fixed", inset:0, background:"#000a", zIndex:100, display:"flex", justifyContent:"flex-end" }}
          onClick={() => setSelected(null)}>
          <div style={{ width:420, maxWidth:"100%", background:C.panel, overflowY:"auto", padding:32, borderLeft:`2px solid ${C.gold}` }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} style={{ background:"none", border:"none", color:C.muted,
              fontFamily:"'Bebas Neue',sans-serif", fontSize:14, cursor:"pointer", letterSpacing:"0.2em", marginBottom:20 }}>
              ← CLOSE
            </button>
            <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:C.gold, margin:"0 0 4px" }}>
              {selected.camper_first_name} {selected.camper_last_name}
            </h2>
            <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:13, color:C.muted, margin:"0 0 24px" }}>
              Registered {new Date(selected.created_at).toLocaleDateString()}
            </p>
            {[
              ["Grade", selected.camper_grade],
              ["DOB", selected.camper_dob],
              ["Age", selected.camper_age],
              ["T-Shirt", selected.camper_tshirt_size],
              ["Parent", `${selected.parent_first_name} ${selected.parent_last_name}`],
              ["Email", selected.parent_email],
              ["Phone", selected.parent_phone],
              ["Emergency Contact", selected.emergency_contact_name],
              ["EC Phone", selected.emergency_contact_phone],
              ["EC Relationship", selected.emergency_contact_relationship],
              ["Allergies", selected.allergies_medical || "None"],
              ["Accommodations", selected.special_accommodations || "None"],
              ["Returning Family", selected.returning_family ? "Yes ★" : "No"],
              ["Showcase RSVP", selected.showcase_attending ? `Yes (${selected.showcase_guest_count} guests)` : "No"],
              ["Status", selected.status],
            ].map(([k,v]) => (
              <div key={k} style={{ borderBottom:`1px solid ${C.border}`, padding:"10px 0" }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:11, letterSpacing:"0.2em", color:C.gold }}>{k}</div>
                <div style={{ fontFamily:"'Barlow',sans-serif", fontSize:14, color:C.white, marginTop:2 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ATTENDANCE TAB ──────────────────────────────────────────────────────────
function AttendanceTab({ regs }) {
  const [day, setDay] = useState(CAMP_DAYS[0].date);
  const [attendance, setAttendance] = useState({});
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/ygb/attendance?date=${day}`)
      .then(r => (r.ok ? r.json() : { attendance: [] }))
      .then(d => {
        if (!active) return;
        const map = {};
        (d.attendance || []).forEach(r => { map[r.registration_id] = r.checked_in; });
        setAttendance(map);
      })
      .catch(() => { if (active) setAttendance({}); });
    return () => { active = false; };
  }, [day]);

  const toggle = async (regId) => {
    const now = !attendance[regId];
    setSaving(regId);
    setAttendance(p => ({ ...p, [regId]: now }));
    try {
      await fetch("/api/admin/ygb/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: regId, attendance_date: day, checked_in: now }),
      });
    } finally {
      setSaving(null);
    }
  };

  const confirmedRegs = regs.filter(r => r.status === "confirmed");
  const present = Object.values(attendance).filter(Boolean).length;

  return (
    <div>
      {/* Day selector */}
      <div style={{ display:"flex", gap:8, marginBottom:28, flexWrap:"wrap" }}>
        {CAMP_DAYS.map(d => (
          <button key={d.date} onClick={() => setDay(d.date)} style={{
            background: d.date===day ? C.gold : "#1a1a1a",
            color: d.date===day ? C.bg : C.muted,
            fontFamily:"'Bebas Neue',sans-serif", fontSize:14, letterSpacing:"0.15em",
            padding:"10px 20px", border:`1px solid ${d.date===day?C.gold:C.border}`,
            cursor:"pointer",
          }}>{d.label}</button>
        ))}
      </div>

      {/* Summary */}
      <div style={{ display:"flex", gap:16, marginBottom:24, flexWrap:"wrap" }}>
        <StatBox label="Present" val={present} color={C.green} />
        <StatBox label="Absent"  val={Math.max(0, confirmedRegs.length - present)} color={C.red} />
        <StatBox label="Total"   val={confirmedRegs.length} color={C.gold} />
      </div>

      {/* Roll call */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:10 }}>
        {confirmedRegs.map(r => {
          const checked = !!attendance[r.id];
          return (
            <div key={r.id} onClick={() => toggle(r.id)} style={{
              background: checked ? `${C.green}18` : C.card,
              border: `1px solid ${checked ? C.green : C.border}`,
              padding:"16px 20px", cursor:"pointer", transition:"all 0.15s",
              display:"flex", justifyContent:"space-between", alignItems:"center",
              opacity: saving===r.id ? 0.5 : 1,
            }}>
              <div>
                <div style={{ fontFamily:"'Barlow',sans-serif", fontSize:15, color:C.white, fontWeight:600 }}>
                  {r.camper_first_name} {r.camper_last_name}
                </div>
                <div style={{ fontFamily:"'Barlow',sans-serif", fontSize:12, color:C.muted }}>
                  {r.camper_grade} grade
                </div>
              </div>
              <div style={{ fontSize:24 }}>{checked ? "✅" : "⬜"}</div>
            </div>
          );
        })}
        {confirmedRegs.length === 0 && (
          <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:14, color:C.muted }}>No confirmed campers yet.</p>
        )}
      </div>
    </div>
  );
}

// ─── SHOWCASE TAB ─────────────────────────────────────────────────────────────
function ShowcaseTab({ regs }) {
  const rsvpd = regs.filter(r => r.showcase_attending);
  const totalGuests = rsvpd.reduce((a,r) => a + (r.showcase_guest_count||0), 0);

  return (
    <div>
      <div style={{ display:"flex", gap:16, marginBottom:28, flexWrap:"wrap" }}>
        <StatBox label="Families RSVPd" val={rsvpd.length} color={C.gold} />
        <StatBox label="Total Guests"   val={totalGuests} color={C.green} />
        <StatBox label="Not RSVPd Yet"  val={regs.length - rsvpd.length} color={C.muted} />
      </div>

      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"'Barlow',sans-serif", fontSize:14 }}>
          <thead>
            <tr style={{ borderBottom:`2px solid ${C.gold}` }}>
              {["Camper","Parent","Email","Guests"].map(h => (
                <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontFamily:"'Bebas Neue',sans-serif",
                  fontSize:11, letterSpacing:"0.2em", color:C.gold }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regs.map((r,i) => (
              <tr key={r.id} style={{ background:i%2===0?C.panel:C.card, borderBottom:`1px solid ${C.border}` }}>
                <td style={{ padding:"12px", color:C.white }}>{r.camper_first_name} {r.camper_last_name}</td>
                <td style={{ padding:"12px", color:C.muted }}>{r.parent_first_name} {r.parent_last_name}</td>
                <td style={{ padding:"12px", color:C.muted, fontSize:12 }}>{r.parent_email}</td>
                <td style={{ padding:"12px", textAlign:"center" }}>
                  {r.showcase_attending
                    ? <Badge text={`${r.showcase_guest_count} guests`} color={C.green} />
                    : <span style={{ color:"#333", fontFamily:"'Bebas Neue',sans-serif", fontSize:11 }}>NOT RSVPd</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── TSHIRT TAB ───────────────────────────────────────────────────────────────
function TShirtTab({ regs }) {
  const counts = regs.reduce((acc, r) => {
    acc[r.camper_tshirt_size] = (acc[r.camper_tshirt_size]||0)+1;
    return acc;
  }, {});

  const sizes = ["Youth XS (2–4)","Youth S (6–8)","Youth M (10–12)","Youth L (14–16)",
    "Youth XL (18–20)","Adult S","Adult M","Adult L"];
  const max = Math.max(...Object.values(counts), 1);

  return (
    <div style={{ maxWidth:600 }}>
      <p style={{ fontFamily:"'Barlow',sans-serif", fontSize:15, color:C.muted, marginBottom:24 }}>
        T-shirt order reference. {regs.length} total.
      </p>
      {sizes.map(s => {
        const n = counts[s]||0;
        return (
          <div key={s} style={{ marginBottom:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ fontFamily:"'Barlow',sans-serif", fontSize:14, color:C.white }}>{s}</span>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color: n>0?C.gold:C.muted }}>{n}</span>
            </div>
            <div style={{ height:8, background:"#1a1a1a" }}>
              <div style={{ height:8, width:`${(n/max)*100}%`, background:n>0?C.gold:"#222", transition:"width 0.4s" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── STAT BOX ─────────────────────────────────────────────────────────────────
function StatBox({ label, val, color }) {
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderTop:`3px solid ${color}`,
      padding:"16px 20px", minWidth:100 }}>
      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:36, color, lineHeight:1 }}>{val}</div>
      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:11, letterSpacing:"0.2em", color:C.muted, marginTop:4 }}>{label}</div>
    </div>
  );
}

// ─── MAIN ADMIN ───────────────────────────────────────────────────────────────
const TABS = ["ROSTER","ATTENDANCE","SHOWCASE","T-SHIRTS"];

export default function YGBAdmin() {
  const [tab, setTab] = useState("ROSTER");
  const [regs, setRegs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/ygb/registrations")
      .then(r => (r.ok ? r.json() : { registrations: [] }))
      .then(d => { setRegs(Array.isArray(d.registrations) ? d.registrations : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const confirmed = regs.filter(r => r.status === "confirmed").length;
  const waitlisted = regs.filter(r => r.status === "waitlisted").length;

  return (
    <div style={{ background:C.bg, minHeight:"100vh", color:C.white, fontFamily:"'Barlow',sans-serif" }}>
      {/* Header */}
      <div style={{ background:C.panel, borderBottom:`2px solid ${C.gold}`, padding:"20px 32px",
        display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <YgbCrown size={46} color={C.gold} />
          <div>
            <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(24px,5vw,40px)",
              color:C.gold, margin:0, letterSpacing:"0.05em" }}>
              YGB CREATORS CAMP
            </h1>
            <p style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:12, letterSpacing:"0.3em",
              color:C.muted, margin:0 }}>ADMIN DASHBOARD · AUGUST 3–7, 2025</p>
          </div>
        </div>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <StatBox label="Confirmed" val={`${confirmed}/${CAPACITY}`} color={confirmed>=CAPACITY?C.red:C.gold} />
          <StatBox label="Waitlisted" val={waitlisted} color={waitlisted>0?C.red:C.muted} />
          <StatBox label="Total" val={regs.length} color={C.white} />
          <StatBox label="Showcase RSVPs" val={regs.filter(r=>r.showcase_attending).length} color={C.green} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background:C.panel, display:"flex", borderBottom:`1px solid ${C.border}`, padding:"0 32px", flexWrap:"wrap" }}>
        {TABS.map(t => (
          <Tab key={t} label={t} active={tab===t} onClick={() => setTab(t)} />
        ))}
      </div>

      {/* Content */}
      <div style={{ padding:"32px" }}>
        {loading
          ? <p style={{ color:C.muted, fontFamily:"'Barlow',sans-serif" }}>Loading registrations...</p>
          : <>
              {tab==="ROSTER"     && <RosterTab     regs={regs} />}
              {tab==="ATTENDANCE" && <AttendanceTab  regs={regs} />}
              {tab==="SHOWCASE"   && <ShowcaseTab    regs={regs} />}
              {tab==="T-SHIRTS"   && <TShirtTab      regs={regs} />}
            </>
        }
      </div>
    </div>
  );
}
