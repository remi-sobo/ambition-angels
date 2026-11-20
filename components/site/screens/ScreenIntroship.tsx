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
    const d = props.device || "both";
    const both = d === "both";
    return {
      showLaptop: d !== "phone", showPhone: d !== "laptop",
      padR: both ? "14%" : "0", padB: both ? "8%" : "0",
      phonePos: (both ? "absolute" : "relative") as "absolute" | "relative", phoneW: both ? "27%" : "min(100%, 280px)",
      caption: props.caption ?? "", hasCaption: !!(props.caption ?? ""),
      capColor: props.onDark ? "var(--gray-mid)" : "var(--muted)",
      capAlign: (d === "phone" ? "center" : "left") as "center" | "left",
    };
}

export default function ScreenIntroship(props: Props) {
  const { capAlign, capColor, caption, hasCaption, padB, padR, phonePos, phoneW, showLaptop, showPhone } = vals(props);
  return (
    <>
      <figure style={{ margin: "0", minWidth: "0", padding: "0 2.5%", fontFamily: "var(--font-body)" }}>
        <div style={{ position: "relative", paddingRight: padR, paddingBottom: padB }}>
          {showLaptop && (
            <>
              <div>
                <div style={{ background: "#1A1A1A", borderRadius: "14px 14px 0 0", padding: "1.4% 1.4% 1.8%", boxShadow: "0 0 0 1px #2E2E2E" }}>
                  <Fit w={1280} style={{ position: "relative", width: "100%", aspectRatio: "16/10", overflow: "hidden", background: "var(--cream)", borderRadius: "3px" }}>
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
                      <div style={{ padding: "36px 56px" }}>
                        <div style={{ fontFamily: "var(--font-heading)", fontSize: "15px", color: "var(--muted)", marginBottom: "10px" }}>Careers / Health & Wellness</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "18px", marginBottom: "22px" }}>
                          <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "42px", letterSpacing: "-0.02em", color: "var(--ink)" }}>Registered Nursing</div>
                          <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "15px", color: "var(--orange-dark)", background: "var(--orange-light)", padding: "7px 16px", borderRadius: "999px" }}>Introship · 8 to 10 min</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "18px", marginBottom: "30px" }}>
                          <div style={{ flex: "1", height: "10px", background: "var(--gray-light)", borderRadius: "999px", overflow: "hidden" }}>
                            <div style={{ width: "44%", height: "100%", background: "var(--orange)", borderRadius: "999px" }} />
                          </div>
                          <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "15px", color: "var(--charcoal)", whiteSpace: "nowrap" }}>4 of 9 min</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: "28px" }}>
                          <div style={{ aspectRatio: "16/9", background: "var(--ink)", borderRadius: "20px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
                            <div style={{ width: "84px", height: "84px", borderRadius: "50%", background: "var(--orange)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                            <div style={{ position: "absolute", left: "28px", bottom: "24px", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "18px", color: "var(--cream)" }}>Twelve hours on a hospital floor</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                            <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "20px", padding: "26px" }}>
                              <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", marginBottom: "10px" }}>What they do</div>
                              <div style={{ fontSize: "18px", lineHeight: "1.55", color: "var(--charcoal)" }}>Nurses check on patients, give medicine, and catch problems before they get worse. They are the person a patient sees most.</div>
                            </div>
                            <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "20px", padding: "26px" }}>
                              <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", marginBottom: "8px" }}>What it pays</div>
                              <div style={{ fontFamily: "var(--font-display)", fontWeight: "800", fontSize: "52px", lineHeight: "1", color: "var(--ink)" }}>$63K to $132K</div>
                              <div style={{ fontSize: "15px", color: "var(--muted)", marginTop: "6px" }}>a year, depending on state and experience</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Fit>
                </div>
                <div style={{ height: "14px", background: "#2A2A2A", borderRadius: "0 0 14px 14px", margin: "0 -2.5%", boxShadow: "0 24px 50px rgba(0,0,0,0.35)" }} />
              </div>
            </>
          )}
          {showPhone && (
            <>
              <div style={{ position: phonePos, right: "0", bottom: "0", width: phoneW, margin: "0 auto", background: "#111", borderRadius: "17% / 8%", padding: "3.2%", boxShadow: "0 0 0 1.5px #3A3A3A, 0 30px 60px rgba(0,0,0,0.45)" }}>
                <Fit w={390} style={{ position: "relative", width: "100%", aspectRatio: "390/844", overflow: "hidden", borderRadius: "14% / 6.5%", background: "var(--cream)" }}>
                  <div style={{ position: "absolute", top: "0", left: "0", width: "390px", height: "844px", transformOrigin: "0 0", background: "var(--cream)" }}>
                    <div style={{ height: "54px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 30px", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", color: "var(--ink)" }}>
                      <span>9:41</span>
                      <span style={{ width: "110px", height: "32px", background: "#000", borderRadius: "18px" }} />
                      <span style={{ width: "24px" }} />
                    </div>
                    <div style={{ padding: "14px 24px 0" }}>
                      <div style={{ fontFamily: "var(--font-heading)", fontSize: "14px", color: "var(--muted)", marginBottom: "4px" }}>Health & Wellness</div>
                      <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "30px", lineHeight: "1.1", letterSpacing: "-0.02em", marginBottom: "12px", color: "var(--ink)" }}>Registered Nursing</div>
                      <span style={{ display: "inline-block", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "13px", color: "var(--orange-dark)", background: "var(--orange-light)", padding: "6px 14px", borderRadius: "999px", marginBottom: "18px" }}>Introship · 8 to 10 min</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                        <div style={{ flex: "1", height: "8px", background: "var(--gray-light)", borderRadius: "999px", overflow: "hidden" }}>
                          <div style={{ width: "44%", height: "100%", background: "var(--orange)" }} />
                        </div>
                        <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "13px", color: "var(--charcoal)" }}>4 of 9 min</span>
                      </div>
                      <div style={{ aspectRatio: "16/10", background: "var(--ink)", borderRadius: "18px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "18px" }}>
                        <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "var(--orange)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                      <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "18px", padding: "18px", marginBottom: "14px" }}>
                        <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", marginBottom: "6px" }}>What they do</div>
                        <div style={{ fontSize: "16px", lineHeight: "1.5", color: "var(--charcoal)" }}>Check on patients, give medicine, and catch problems early.</div>
                      </div>
                      <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "18px", padding: "18px", marginBottom: "18px" }}>
                        <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", marginBottom: "6px" }}>What it pays</div>
                        <div style={{ fontFamily: "var(--font-display)", fontWeight: "800", fontSize: "40px", lineHeight: "1", color: "var(--ink)" }}>$63K to $132K</div>
                      </div>
                      <div style={{ height: "56px", borderRadius: "999px", background: "var(--orange)", color: "#fff", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "17px", display: "flex", alignItems: "center", justifyContent: "center" }}>Keep going</div>
                    </div>
                  </div>
                </Fit>
              </div>
            </>
          )}
        </div>
        {hasCaption && (
          <>
            <figcaption style={{ marginTop: "16px", fontSize: "12px", color: capColor, textAlign: capAlign }}>{caption}</figcaption>
          </>
        )}
      </figure>
    </>
  );
}
