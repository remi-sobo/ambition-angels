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
    const chip = {
      "On track": { chipBg: "var(--ink)", chipColor: "var(--cream)", chipBorder: "var(--ink)" },
      "Making progress": { chipBg: "var(--gray-light)", chipColor: "var(--charcoal)", chipBorder: "var(--rule)" },
      "Needs a check-in": { chipBg: "var(--orange-light)", chipColor: "var(--orange-dark)", chipBorder: "rgb(232 80 10 / 0.35)" },
    };
    const roster = ([
      ["Maya", "Registered Nursing", 6, "Today", "On track"], ["Jaylen", "Game Design", 4, "Today", "On track"], ["Lena", "Marketing", 7, "Today", "On track"],
      ["Aaron", "Software Engineering", 2, "Yesterday", "Making progress"], ["Sofia", "Wealth Management", 3, "2 days ago", "Making progress"],
      ["Isaiah", "Firefighting", 1, "9 days ago", "Needs a check-in"], ["Omar", "Entrepreneurship", 1, "12 days ago", "Needs a check-in"],
    ] as [string, string, number, string, keyof typeof chip][]).map(([name, career, lv, last, status]) => ({ name, career, segs: segs(lv), levelLabel: String(lv), last, status, ...chip[status] }));
    return {
       roster,
      phoneRoster: [roster[0], roster[1], roster[3], roster[5], roster[6]],
      quiet: [{ name: "Isaiah", note: "stopped partway through Firefighting, 9 days ago" }, { name: "Omar", note: "has not opened Entrepreneurship in 12 days" }],
      spotlight: [{ name: "Registered Nursing", segs: segs(3) }, { name: "Physical Therapy", segs: segs(1) }, { name: "Marketing", segs: segs(2) }],
      withPhone: !!props.withPhone,
      caption: props.caption ?? "", hasCaption: !!(props.caption ?? ""),
      capColor: props.onDark ? "var(--gray-mid)" : "var(--muted)",
    };
}

export default function ScreenGuideDashboard(props: Props) {
  const { capColor, caption, hasCaption, phoneRoster, quiet, roster, spotlight, withPhone } = vals(props);
  return (
    <>
      <figure style={{ margin: "0", minWidth: "0", padding: "0 2.5%", fontFamily: "var(--font-body)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "clamp(16px,3vw,40px)" }}>
          <div style={{ flex: "1", minWidth: "0" }}>
            <div style={{ background: "#1A1A1A", borderRadius: "14px 14px 0 0", padding: "1.2% 1.2% 1.6%", boxShadow: "0 0 0 1px #2E2E2E" }}>
              <Fit w={1280} style={{ position: "relative", width: "100%", aspectRatio: "16/10", overflow: "hidden", borderRadius: "3px", background: "var(--cream)" }}>
                <div style={{ position: "absolute", top: "0", left: "0", width: "1280px", height: "800px", transformOrigin: "0 0", background: "var(--cream)" }}>
                  <div style={{ height: "72px", background: "var(--paper)", borderBottom: "1px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <img src="/images/site/logo-mark-orange.png" alt="" style={{ height: "34px" }} />
                      <span style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "22px", color: "var(--ink)" }}>My Ambition</span>
                      <span style={{ fontFamily: "var(--font-heading)", fontSize: "16px", color: "var(--muted)", marginLeft: "8px" }}>Guide dashboard</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", fontFamily: "var(--font-heading)", fontSize: "16px", color: "var(--charcoal)" }}>
                      <span style={{ padding: "8px 16px", border: "1px solid var(--rule)", borderRadius: "999px", background: "var(--cream)" }}>3rd period advisory</span>
                      <span style={{ fontWeight: "600" }}>Ms. Rivera</span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "24px", padding: "26px 40px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                      <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "20px", overflow: "hidden" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid var(--rule)" }}>
                          <span style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "19px", color: "var(--ink)" }}>Roster</span>
                          <span style={{ fontFamily: "var(--font-heading)", fontSize: "14px", color: "var(--muted)" }}>7 students · this week</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.6fr 1.1fr 1fr 1.3fr", padding: "12px 24px", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", borderBottom: "1px solid var(--rule)" }}>
                          <span>Student</span>
                          <span>Exploring</span>
                          <span>Careers tried</span>
                          <span>Last active</span>
                          <span>Status</span>
                        </div>
                        {roster.map((s, i) => (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.1fr 1.6fr 1.1fr 1fr 1.3fr", alignItems: "center", padding: "0 24px", height: "50px", borderBottom: "1px solid var(--gray-light)", fontSize: "16px", color: "var(--charcoal)" }}>
                            <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", color: "var(--ink)" }}>{s.name}</span>
                            <span>{s.career}</span>
                            <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", color: "var(--ink)" }}>{s.levelLabel}</span>
                            <span>{s.last}</span>
                            <span>
                              <span style={{ display: "inline-block", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "13px", padding: "5px 12px", borderRadius: "999px", background: s.chipBg, color: s.chipColor, border: `1px solid ${s.chipBorder}` }}>{s.status}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                      <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "20px", padding: "18px 24px" }}>
                        <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "17px", marginBottom: "10px", color: "var(--ink)" }}>Quiet this week</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {quiet.map((q, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "15px", color: "var(--charcoal)" }}>
                              <span>
                                <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", color: "var(--ink)" }}>{q.name}</span>
                                {" · "}{q.note}
                              </span>
                              <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "14px", padding: "7px 16px", borderRadius: "999px", background: "var(--orange)", color: "#fff" }}>Send a note</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                      <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "20px", padding: "24px" }}>
                        <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", marginBottom: "12px" }}>Spotlight</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
                          <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--orange-light)", color: "var(--orange)", fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center" }}>M</div>
                          <div>
                            <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "20px", color: "var(--ink)" }}>Maya</div>
                            <div style={{ fontSize: "14px", color: "var(--muted)" }}>3 careers explored</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "18px" }}>
                          {spotlight.map((sp, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "15px", color: "var(--charcoal)" }}>
                              <span>{sp.name}</span>
                              <span style={{ display: "flex", gap: "4px", width: "66px" }}>
                                {sp.segs.map((g, i) => (
                                  <span key={i} style={{ flex: "1", height: "6px", borderRadius: "999px", background: g }} />
                                ))}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: "15px", lineHeight: "1.5", color: "var(--charcoal)", paddingTop: "14px", borderTop: "1px solid var(--gray-light)" }}>
                          <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", color: "var(--ink)" }}>She said:</span>
                          {" \"I liked writing the care plan. I did not like the idea of night shifts.\""}
                        </div>
                      </div>
                      <div style={{ background: "var(--orange-light)", border: "1px solid rgb(232 80 10 / 0.2)", borderRadius: "20px", padding: "24px" }}>
                        <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange-dark)", marginBottom: "10px" }}>Ask Maya</div>
                        <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "18px", lineHeight: "1.4", color: "var(--ink)", marginBottom: "12px" }}>You just explored nursing. Which part of the job felt most like you, and which part would you hand to someone else?</div>
                        <div style={{ fontSize: "13px", color: "var(--charcoal)" }}>Tied to the Registered Nursing introship</div>
                      </div>
                    </div>
                  </div>
                </div>
              </Fit>
            </div>
            <div style={{ height: "14px", background: "#2A2A2A", borderRadius: "0 0 14px 14px", margin: "0 -2%", boxShadow: "0 24px 50px rgba(14,14,14,0.22)" }} />
          </div>
          {withPhone && (
            <>
              <div style={{ width: "21%", flexShrink: "0", background: "#111", borderRadius: "17% / 8%", padding: "0", boxShadow: "0 0 0 1.5px #3A3A3A, 0 30px 60px rgba(14,14,14,0.3)" }}>
                <div style={{ padding: "7%" }}>
                  <Fit w={390} style={{ position: "relative", width: "100%", aspectRatio: "390/844", overflow: "hidden", borderRadius: "14% / 6.5%", background: "var(--cream)" }}>
                    <div style={{ position: "absolute", top: "0", left: "0", width: "390px", height: "844px", transformOrigin: "0 0", background: "var(--cream)" }}>
                      <div style={{ height: "54px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 30px", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", color: "var(--ink)" }}>
                        <span>9:41</span>
                        <span style={{ width: "110px", height: "32px", background: "#000", borderRadius: "18px" }} />
                        <span style={{ width: "24px" }} />
                      </div>
                      <div style={{ padding: "14px 22px 0" }}>
                        <div style={{ fontFamily: "var(--font-heading)", fontSize: "14px", color: "var(--muted)" }}>Guide · 3rd period advisory</div>
                        <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "30px", letterSpacing: "-0.02em", color: "var(--ink)", margin: "4px 0 18px" }}>Your students</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
                          {phoneRoster.map((s, i) => (
                            <div key={i} style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "16px", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                              <div>
                                <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "17px", color: "var(--ink)" }}>{s.name}</div>
                                <div style={{ fontSize: "14px", color: "var(--muted)" }}>{s.career}</div>
                              </div>
                              <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", padding: "5px 10px", borderRadius: "999px", background: s.chipBg, color: s.chipColor, border: `1px solid ${s.chipBorder}`, whiteSpace: "nowrap" }}>{s.status}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ background: "var(--orange-light)", border: "1px solid rgb(232 80 10 / 0.2)", borderRadius: "16px", padding: "16px" }}>
                          <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "11px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange-dark)", marginBottom: "6px" }}>Ask Maya</div>
                          <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", lineHeight: "1.4", color: "var(--ink)" }}>Which part of nursing felt most like you?</div>
                        </div>
                      </div>
                    </div>
                  </Fit>
                </div>
              </div>
            </>
          )}
        </div>
        {hasCaption && (
          <>
            <figcaption style={{ marginTop: "18px", fontSize: "12px", color: capColor, textAlign: "center" }}>{caption}</figcaption>
          </>
        )}
      </figure>
    </>
  );
}
