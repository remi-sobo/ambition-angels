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
    const segs = (n: number) => [0, 1, 2].map((i) => (i < n ? "var(--orange)" : "var(--gray-light)"));
    const library = ([
      ["Registered Nursing", "Health & Wellness", 3], ["Game Design", "Tech & Design", 2], ["Wealth Management", "Business", 1], ["Firefighting", "Health & Wellness", 1],
      ["Software Engineering", "Tech & Design", 0], ["Marketing", "Business", 2], ["Culinary Arts", "Creative & Trades", 0], ["Physical Therapy", "Health & Wellness", 0],
    ] as [string, string, number][]).map(([name, cat, n], i) => ({ name, cat, num: String(i + 1).padStart(2, "0"), segs: segs(n), status: n === 0 ? "Not started" : n === 3 ? "Explored · Internship open" : "In progress" }));
    return {
       library,
      caption: props.caption ?? "", hasCaption: !!(props.caption ?? ""),
      capColor: props.onDark ? "var(--gray-mid)" : "var(--muted)",
      capAlign: (props.center ? "center" : "left") as "center" | "left",
    };
}

export default function ScreenCareerLibrary(props: Props) {
  const { capAlign, capColor, caption, hasCaption, library } = vals(props);
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
                </div>
                <div style={{ display: "flex", gap: "36px", fontFamily: "var(--font-heading)", fontWeight: "500", fontSize: "17px", color: "var(--muted)" }}>
                  <span style={{ color: "var(--ink)" }}>Careers</span>
                  <span>My progress</span>
                  <span>My guides</span>
                </div>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "var(--orange-light)", color: "var(--orange)", fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center" }}>J</div>
              </div>
              <div style={{ padding: "36px 48px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "26px" }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "36px", letterSpacing: "-0.02em", color: "var(--ink)" }}>Explore careers</div>
                  <div style={{ display: "flex", gap: "10px", fontFamily: "var(--font-heading)", fontWeight: "500", fontSize: "15px" }}>
                    <span style={{ padding: "8px 18px", borderRadius: "999px", background: "var(--ink)", color: "var(--cream)" }}>All</span>
                    <span style={{ padding: "8px 18px", borderRadius: "999px", border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--charcoal)" }}>Business</span>
                    <span style={{ padding: "8px 18px", borderRadius: "999px", border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--charcoal)" }}>Tech & Design</span>
                    <span style={{ padding: "8px 18px", borderRadius: "999px", border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--charcoal)" }}>Health</span>
                    <span style={{ padding: "8px 18px", borderRadius: "999px", border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--charcoal)" }}>Creative & Trades</span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "20px" }}>
                  {library.map((c, i) => (
                    <div key={i} style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "20px", padding: "22px", height: "268px", display: "flex", flexDirection: "column" }}>
                      <div style={{ height: "96px", borderRadius: "14px", background: "var(--surface-tint)", backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.12) 1px, transparent 1px)", backgroundSize: "14px 14px", marginBottom: "16px", display: "flex", alignItems: "flex-end", padding: "12px 14px" }}>
                        <span style={{ fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "34px", lineHeight: "1", color: "var(--orange)" }}>{c.num}</span>
                      </div>
                      <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "6px" }}>{c.cat}</div>
                      <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "20px", lineHeight: "1.2", color: "var(--ink)", flex: "1" }}>{c.name}</div>
                      <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                        {c.segs.map((s, i) => (
                          <div key={i} style={{ flex: "1", height: "7px", borderRadius: "999px", background: s }} />
                        ))}
                      </div>
                      <div style={{ fontFamily: "var(--font-heading)", fontSize: "13px", color: "var(--muted)" }}>{c.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Fit>
        </div>
        <div style={{ height: "14px", background: "#2A2A2A", borderRadius: "0 0 14px 14px", margin: "0 -2.5%", boxShadow: "0 24px 50px rgba(14,14,14,0.22)" }} />
        {hasCaption && (
          <>
            <figcaption style={{ marginTop: "18px", fontSize: "12px", color: capColor, textAlign: capAlign }}>{caption}</figcaption>
          </>
        )}
      </figure>
    </>
  );
}
