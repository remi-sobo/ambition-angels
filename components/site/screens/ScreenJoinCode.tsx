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
    return {
      code: ["7", "K", "4", "2", "Q", ""].map((c, i) => ({ c, border: i === 5 ? "var(--orange)" : "var(--rule)" })),
      caption: props.caption ?? "", hasCaption: !!(props.caption ?? ""),
      capColor: props.onDark ? "var(--gray-mid)" : "var(--muted)",
    };
}

export default function ScreenJoinCode(props: Props) {
  const { capColor, caption, code, hasCaption } = vals(props);
  return (
    <>
      <figure style={{ margin: "0", minWidth: "0", padding: "0 2.5%", fontFamily: "var(--font-body)" }}>
        <div style={{ background: "#1A1A1A", borderRadius: "14px 14px 0 0", padding: "1.4% 1.4% 1.8%", boxShadow: "0 0 0 1px #2E2E2E" }}>
          <Fit w={1280} style={{ position: "relative", width: "100%", aspectRatio: "16/10", overflow: "hidden", borderRadius: "3px", background: "var(--cream)" }}>
            <div style={{ position: "absolute", top: "0", left: "0", width: "1280px", height: "800px", transformOrigin: "0 0", background: "var(--surface-tint)", backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", display: "flex", flexDirection: "column" }}>
              <div style={{ height: "72px", display: "flex", alignItems: "center", padding: "0 48px", gap: "12px" }}>
                <img src="/images/site/logo-mark-orange.png" alt="" style={{ height: "34px" }} />
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "22px", color: "var(--ink)" }}>My Ambition</span>
              </div>
              <div style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: "560px", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "28px", padding: "52px 56px", textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "13px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", marginBottom: "12px" }}>Join your class</div>
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "38px", letterSpacing: "-0.02em", lineHeight: "1.15", color: "var(--ink)", marginBottom: "12px" }}>Enter your class code</div>
                  <div style={{ fontSize: "18px", color: "var(--charcoal)", marginBottom: "32px" }}>{"Your teacher has it. It's six characters."}</div>
                  <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginBottom: "28px" }}>
                    {code.map((ch, i) => (
                      <div key={i} style={{ width: "62px", height: "76px", borderRadius: "14px", border: `1.5px solid ${ch.border}`, background: "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: "800", fontSize: "44px", color: "var(--ink)" }}>{ch.c}</div>
                    ))}
                  </div>
                  <div style={{ height: "58px", borderRadius: "999px", background: "var(--orange)", color: "#fff", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "18px" }}>Join 3rd period advisory</div>
                  <div style={{ fontSize: "15px", color: "var(--muted)" }}>Ms. Rivera · Lincoln High School</div>
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
