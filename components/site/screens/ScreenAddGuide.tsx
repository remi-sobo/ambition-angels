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
      guides: [
        { i: "R", name: "Ms. Rivera", role: "Advisory teacher", state: "Added" },
        { i: "A", name: "Andre", role: "Mentor", state: "Added" },
        { i: "D", name: "Coach Daniels", role: "Coach", state: "Invited" },
      ],
      caption: props.caption ?? "", hasCaption: !!(props.caption ?? ""),
      capColor: props.onDark ? "var(--gray-mid)" : "var(--muted)",
    };
}

export default function ScreenAddGuide(props: Props) {
  const { capColor, caption, guides, hasCaption } = vals(props);
  return (
    <>
      <figure style={{ margin: "0", minWidth: "0", fontFamily: "var(--font-body)", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "min(100%,300px)", background: "#111", borderRadius: "17% / 8%", padding: "3.2%", boxShadow: "0 0 0 1.5px #3A3A3A, 0 30px 60px rgba(14,14,14,0.3)" }}>
          <Fit w={390} style={{ position: "relative", width: "100%", aspectRatio: "390/844", overflow: "hidden", borderRadius: "14% / 6.5%", background: "var(--cream)" }}>
            <div style={{ position: "absolute", top: "0", left: "0", width: "390px", height: "844px", transformOrigin: "0 0", background: "var(--cream)" }}>
              <div style={{ height: "54px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 30px", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", color: "var(--ink)" }}>
                <span>9:41</span>
                <span style={{ width: "110px", height: "32px", background: "#000", borderRadius: "18px" }} />
                <span style={{ width: "24px" }} />
              </div>
              <div style={{ padding: "14px 24px 0" }}>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: "14px", color: "var(--muted)", marginBottom: "4px" }}>My guides</div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "30px", lineHeight: "1.12", letterSpacing: "-0.02em", color: "var(--ink)", marginBottom: "10px" }}>Add the adults in your corner</div>
                <div style={{ fontSize: "15px", lineHeight: "1.5", color: "var(--charcoal)", marginBottom: "20px" }}>{"They'll see what you're exploring and help you figure out what's next."}</div>
                <div style={{ height: "52px", border: "1.5px solid var(--orange)", borderRadius: "14px", background: "var(--paper)", display: "flex", alignItems: "center", padding: "0 16px", fontSize: "16px", color: "var(--muted)", marginBottom: "10px" }}>Name or email</div>
                <div style={{ height: "52px", borderRadius: "999px", background: "var(--orange)", color: "#fff", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "26px" }}>Invite by email</div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "10px" }}>Your guides</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {guides.map((g, i) => (
                    <div key={i} style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "16px", padding: "14px 16px", display: "flex", alignItems: "center", gap: "14px" }}>
                      <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "var(--orange-light)", color: "var(--orange)", fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: "0" }}>{g.i}</div>
                      <div style={{ flex: "1" }}>
                        <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "17px", color: "var(--ink)" }}>{g.name}</div>
                        <div style={{ fontSize: "14px", color: "var(--muted)" }}>{g.role}</div>
                      </div>
                      <span style={{ fontFamily: "var(--font-heading)", fontSize: "12px", color: "var(--charcoal)" }}>{g.state}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Fit>
        </div>
        {hasCaption && (
          <>
            <figcaption style={{ marginTop: "16px", fontSize: "12px", color: capColor, textAlign: "center" }}>{caption}</figcaption>
          </>
        )}
      </figure>
    </>
  );
}
