import Link from "next/link";
import { C, F } from "./tokens";
import AccountMenu from "./AccountMenu";

/**
 * Portal header (spec §5.2).
 *
 * Prep progress rides in the header, not just on Home. A director who lands
 * on a meeting from a calendar link otherwise has no idea she still owes two
 * things — the V2 audit's Zeigarnik finding. It disappears at 4 of 4.
 *
 * There is no "Chair controls" toggle. The prototype put a role switch in the
 * account menu; the audit called it an invented pattern, and in the build the
 * chair simply is the chair (driven off board.write).
 */
export function Header({
  name,
  roleLine,
  active,
  prepDone,
  prepTotal,
}: {
  name: string;
  roleLine: string;
  active: "home" | "meetings" | "library" | "people";
  prepDone?: number;
  prepTotal?: number;
}) {
  const nav: { key: typeof active; label: string; href: string }[] = [
    { key: "home", label: "Home", href: "/board" },
    { key: "meetings", label: "Meetings", href: "/board/archive" },
    { key: "library", label: "Library", href: "/board/library" },
    { key: "people", label: "Board", href: "/board/people" },
  ];
  const showPrep =
    typeof prepDone === "number" && typeof prepTotal === "number" && prepTotal > 0 && prepDone < prepTotal;

  return (
    <div
      className="board-chrome"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgb(250 250 248 / 0.95)",
        backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${C.grayLight}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 24px",
          minHeight: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <Link href="/board" style={{ flex: "none", display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-color.png" alt="Ambition Angels" style={{ height: 44, width: "auto", display: "block" }} />
        </Link>

        <nav
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          {nav.map((n) => (
            <Link
              key={n.key}
              href={n.href}
              style={{
                position: "relative",
                fontFamily: F.heading,
                fontSize: 16,
                fontWeight: 500,
                color: C.ink,
                textDecoration: "none",
                paddingBottom: 5,
              }}
            >
              {n.label}
              {active === n.key && (
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 2,
                    background: C.ink,
                  }}
                />
              )}
            </Link>
          ))}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              paddingLeft: 14,
              borderLeft: `1px solid ${C.rule}`,
            }}
          >
            {showPrep && (
              <Link
                href="/board"
                className="board-prep-pill"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  fontSize: 15,
                  color: C.charcoal,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  padding: "7px 4px",
                  margin: "-7px -4px",
                }}
              >
                <span
                  style={{
                    flex: "none",
                    width: 26,
                    height: 3,
                    borderRadius: 2,
                    background: C.rule,
                    display: "block",
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      width: `${Math.round((prepDone! / prepTotal!) * 100)}%`,
                      height: "100%",
                      background: C.ink,
                    }}
                  />
                </span>
                {prepDone} of {prepTotal} before the meeting
              </Link>
            )}
            <span
              style={{
                fontFamily: F.heading,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: C.cream,
                background: C.ink,
                padding: "7px 11px",
                borderRadius: 4,
                whiteSpace: "nowrap",
              }}
            >
              Private
            </span>
            <AccountMenu name={name} roleLine={roleLine} />
          </div>
        </nav>
      </div>
    </div>
  );
}

/** Footer (spec §5.2): EIN, address, and the confidentiality line. */
export function Footer() {
  return (
    <footer
      className="board-chrome"
      style={{
        background: C.ink,
        color: C.cream,
        backgroundImage:
          "radial-gradient(rgba(250,250,248,0.07) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
        marginTop: 80,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "64px 24px 32px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 48,
        }}
      >
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo-white.png"
            alt="Ambition Angels"
            style={{ height: 72, width: "auto", display: "block", marginBottom: 20 }}
          />
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "#C8C6BE", maxWidth: 320 }}>
            Every teen should be able to see what is possible for them and know how to get there. That
            is the whole job.
          </p>
        </div>
        <div>
          <h3
            style={{
              margin: "0 0 20px",
              fontFamily: F.heading,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: C.cream,
            }}
          >
            Board
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 15 }}>
            {[
              ["Meetings", "/board/archive"],
              ["Decisions", "/board/archive?tab=decisions"],
              ["Library", "/board/library"],
              ["Board", "/board/people"],
            ].map(([label, href]) => (
              <Link key={href} href={href} style={{ color: "#C8C6BE", textDecoration: "none", width: "fit-content" }}>
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h3
            style={{
              margin: "0 0 20px",
              fontFamily: F.heading,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: C.cream,
            }}
          >
            Get in touch
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 15, lineHeight: 1.5, color: "#C8C6BE" }}>
            <span>hello@ambitionangels.org</span>
            <span>
              380 Portage Ave
              <br />
              Palo Alto, CA 94306
            </span>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
        <div
          style={{
            borderTop: "1px solid rgb(250 250 248 / 0.1)",
            padding: "24px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, color: "#C8C6BE" }}>
            © {new Date().getFullYear()} Ambition Angels Inc. · US 501(c)(3) · EIN 87-2513010
          </span>
          <span style={{ fontSize: 13, color: "#C8C6BE" }}>
            Board materials are confidential and for director use only.
          </span>
        </div>
      </div>
    </footer>
  );
}
