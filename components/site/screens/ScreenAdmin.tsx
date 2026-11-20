/* eslint-disable @next/next/no-img-element */
import Fit from "@/components/site/Fit";

type Props = {
  device?: "both" | "laptop" | "phone";
  variant?: "school" | "program";
  onDark?: boolean;
  withPhone?: boolean;
  center?: boolean;
  caption?: string;
};

function vals(props: Props) {
    const program = props.variant === "program";
    return {
      org: program ? "Eastside Youth Center · 3 sites" : "Lincoln High School · Fall term",
      barTitle: program ? "Participation by site" : "Participation by class",
      tiles: program
        ? [{ label: "Young people active", value: "186", sub: "of 214 enrolled" }, { label: "Introships finished", value: "642", sub: "this cohort" }, { label: "Careers explored", value: "15", sub: "across sites" }, { label: "Staff guides active", value: "11", sub: "of 12 this week" }]
        : [{ label: "Students active", value: "412", sub: "of 468 enrolled" }, { label: "Introships finished", value: "1,286", sub: "this term" }, { label: "Careers explored", value: "17", sub: "across the building" }, { label: "Guides active", value: "23", sub: "of 26 this week" }],
      bars: program
        ? [{ name: "Main St. site", w: "91%" }, { name: "Northside site", w: "84%" }, { name: "Mentoring cohort", w: "78%" }, { name: "Summer cohort", w: "66%" }]
        : [{ name: "9th advisory", w: "92%" }, { name: "10th advisory", w: "88%" }, { name: "11th advisory", w: "81%" }, { name: "12th advisory", w: "74%" }, { name: "CTE block", w: "96%" }, { name: "After-school", w: "63%" }],
      topCareers: [{ rank: "1", name: "Registered Nursing", n: "184" }, { rank: "2", name: "Game Design", n: "161" }, { rank: "3", name: "Software Engineering", n: "138" }, { rank: "4", name: "Entrepreneurship", n: "117" }, { rank: "5", name: "Firefighting", n: "96" }],
      caption: props.caption ?? "", hasCaption: !!(props.caption ?? ""),
      capColor: props.onDark ? "var(--gray-mid)" : "var(--muted)",
    };
}

export default function ScreenAdmin(props: Props) {
  const { barTitle, bars, capColor, caption, hasCaption, org, tiles, topCareers } = vals(props);
  return (
    <>
      <figure style={{ margin: "0", minWidth: "0", padding: "0 2.5%", fontFamily: "var(--font-body)" }}>
        <div style={{ background: "#1A1A1A", borderRadius: "14px 14px 0 0", padding: "1.4% 1.4% 1.8%", boxShadow: "0 0 0 1px #2E2E2E" }}>
          <Fit w={1280} style={{ position: "relative", width: "100%", aspectRatio: "16/10", overflow: "hidden", borderRadius: "3px", background: "var(--cream)" }}>
            <div style={{ position: "absolute", top: "0", left: "0", width: "1280px", height: "800px", transformOrigin: "0 0", background: "var(--cream)" }}>
              <div style={{ height: "72px", background: "var(--paper)", borderBottom: "1px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <img src="/images/site/logo-mark-orange.png" alt="" style={{ height: "34px" }} />
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "22px", color: "var(--ink)" }}>My Ambition</span>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: "16px", color: "var(--muted)", marginLeft: "8px" }}>Admin</span>
                </div>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: "16px", padding: "8px 16px", border: "1px solid var(--rule)", borderRadius: "999px", background: "var(--cream)", color: "var(--charcoal)" }}>{org}</span>
              </div>
              <div style={{ padding: "32px 48px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "20px", marginBottom: "24px" }}>
                  {tiles.map((t, i) => (
                    <div key={i} style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "20px", padding: "24px" }}>
                      <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "10px" }}>{t.label}</div>
                      <div style={{ fontFamily: "var(--font-display)", fontWeight: "800", fontSize: "60px", lineHeight: "1", color: "var(--ink)" }}>{t.value}</div>
                      <div style={{ fontSize: "14px", color: "var(--muted)", marginTop: "6px" }}>{t.sub}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "20px" }}>
                  <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "20px", padding: "24px 28px" }}>
                    <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "19px", marginBottom: "18px", color: "var(--ink)" }}>{barTitle}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      {bars.map((c, i) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "170px 1fr 48px", alignItems: "center", gap: "14px", fontSize: "15px", color: "var(--charcoal)" }}>
                          <span style={{ fontFamily: "var(--font-heading)", fontWeight: "500" }}>{c.name}</span>
                          <span style={{ height: "14px", background: "var(--gray-light)", borderRadius: "999px", overflow: "hidden" }}>
                            <span style={{ display: "block", height: "100%", width: c.w, background: "var(--orange)", borderRadius: "999px" }} />
                          </span>
                          <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", textAlign: "right" }}>{c.w}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "20px", padding: "24px 28px" }}>
                    <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "19px", marginBottom: "18px", color: "var(--ink)" }}>Top careers explored</div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {topCareers.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "11px 0", borderBottom: "1px solid var(--gray-light)", fontSize: "15px", color: "var(--charcoal)" }}>
                          <span style={{ fontFamily: "var(--font-display)", fontWeight: "800", fontSize: "22px", color: "var(--orange)", width: "28px" }}>{c.rank}</span>
                          <span style={{ flex: "1" }}>{c.name}</span>
                          <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", color: "var(--ink)" }}>{c.n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Fit>
        </div>
        <div style={{ height: "14px", background: "#2A2A2A", borderRadius: "0 0 14px 14px", margin: "0 -2.5%", boxShadow: "0 24px 50px rgba(14,14,14,0.22)" }} />
        {hasCaption && (
          <>
            <figcaption style={{ marginTop: "18px", fontSize: "12px", color: capColor }}>{caption}</figcaption>
          </>
        )}
      </figure>
    </>
  );
}
