import { redirect } from "next/navigation";
import { getBoardContext, getRoster, initialsOf } from "@/lib/board/auth";
import { dateOnly, daysUntil } from "@/lib/board/format";
import { Header, Footer } from "../_components/Chrome";
import { C, F, card, eyebrow } from "../_components/tokens";

export const dynamic = "force-dynamic";

/** Photos live in /public/images and are matched by name; a director with no
 *  photo on file renders as initials rather than a broken image. */
const PHOTOS: Record<string, string> = {
  "Todd Singleton": "/images/Todd.jpeg",
  "Lara Sellers": "/images/Lara.jpeg",
  "Michelle Vilchez": "/images/Michelle.jpg",
  "Jerrel Brown": "/images/Jerrell B.jpeg",
  "Remi Sobomehin": "/images/Remi-Sobomehin_edited_edited.jpeg",
};

const OFFICER: Record<string, string> = {
  chair: "Chair",
  vice_chair: "Vice Chair",
  secretary: "Secretary",
  treasurer: "Treasurer",
};

/**
 * People (spec §5.8).
 *
 * The block at the foot is the "we are a real 501(c)(3)" panel and it answers
 * Form 990 Part VI directly. A term expiring inside 90 days renders in orange;
 * an outstanding COI says so plainly. Neither is softened — a director whose
 * disclosure is outstanding should see it before the Chair has to raise it.
 */
export default async function PeoplePage() {
  const ctx = await getBoardContext();
  if (!ctx) redirect("/board/signin");

  const roster = await getRoster(ctx.orgId);
  const directors = roster.filter((m) => !m.is_staff);
  const staff = roster.filter((m) => m.is_staff);
  const year = new Date().getFullYear();

  return (
    <>
      <Header name={ctx.memberName ?? ctx.email} roleLine={ctx.isStaff ? "Staff" : "Director"} active="people" />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px 80px" }}>
        <h1 style={{ margin: 0, fontFamily: F.heading, fontSize: 32, fontWeight: 600, letterSpacing: "-0.01em", color: C.ink }}>
          Board
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 17, lineHeight: 1.6, color: C.muted, maxWidth: "68ch" }}>
          {directors.length} directors and {staff.length} staff member{staff.length === 1 ? "" : "s"}. Terms
          run three years with no term limits.
        </p>

        <div style={{ ...card, marginTop: 32 }}>
          {[...directors, ...staff].map((m, i) => {
            const expiresIn = daysUntil(m.term_end);
            const expiringSoon = expiresIn !== null && expiresIn >= 0 && expiresIn <= 90;
            const photo = PHOTOS[m.name];

            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 20,
                  padding: "24px 28px",
                  borderTop: i === 0 ? "none" : `1px solid ${C.rule}`,
                  flexWrap: "wrap",
                }}
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo}
                    alt=""
                    style={{ flex: "none", width: 56, height: 56, borderRadius: 999, objectFit: "cover", objectPosition: "center top" }}
                  />
                ) : (
                  <span
                    style={{
                      flex: "none",
                      width: 56,
                      height: 56,
                      borderRadius: 999,
                      background: C.grayLight,
                      color: C.charcoal,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 17,
                      fontWeight: 600,
                    }}
                  >
                    {initialsOf(m.name)}
                  </span>
                )}

                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ fontFamily: F.heading, fontSize: 20, fontWeight: 600, color: C.ink }}>{m.name}</div>
                  <div style={{ fontSize: 15, color: C.charcoal, marginTop: 4 }}>
                    {m.title ?? OFFICER[m.officer_role] ?? "Director"}
                  </div>
                  {m.email && <div style={{ fontSize: 15, color: C.muted, marginTop: 2 }}>{m.email}</div>}
                </div>

                <div style={{ flex: "none", width: 220 }}>
                  <div style={eyebrow}>Term</div>
                  <div
                    style={{
                      fontSize: 15,
                      marginTop: 4,
                      color: expiringSoon ? C.orangeDark : C.charcoal,
                      fontWeight: expiringSoon ? 600 : 400,
                    }}
                  >
                    {m.is_staff
                      ? "Not a director"
                      : m.term_start && m.term_end
                        ? `${m.term_start.slice(0, 4)} to ${m.term_end.slice(0, 4)}${
                            expiringSoon ? `, expires in ${expiresIn} days` : ""
                          }`
                        : "Not recorded"}
                  </div>
                </div>

                <div style={{ flex: "none", width: 200 }}>
                  <div style={eyebrow}>Conflict of interest</div>
                  <div
                    style={{
                      fontSize: 15,
                      marginTop: 4,
                      color:
                        m.coi_status === "outstanding"
                          ? C.orangeDark
                          : m.coi_status === "signed"
                            ? C.charcoal
                            : C.muted,
                      fontWeight: m.coi_status === "outstanding" ? 600 : 400,
                    }}
                  >
                    {m.coi_status === "not_required"
                      ? "Not required"
                      : m.coi_status === "signed"
                        ? // The signing date is shown only where it is known;
                          // the 2026 cycle is recorded without dates.
                          m.coi_signed_at
                          ? `Signed ${dateOnly(m.coi_signed_at, "plain")}`
                          : `Signed for ${year}`
                        : m.coi_status === "outstanding"
                          ? `Outstanding for ${year}`
                          : "Not recorded"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Form 990 Part VI, answerable from one screen. */}
        <section style={{ ...card, marginTop: 32, padding: 28 }}>
          <div style={eyebrow}>Governance</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 20,
              marginTop: 16,
            }}
          >
            <Fact label="Authorized directors" value="15" />
            <Fact label="Directors in office" value={String(directors.length)} />
            <Fact label="Quorum" value="A majority of directors then in office" />
            <Fact label="Terms" value="Three years, no term limits" />
          </div>
          <p style={{ margin: "20px 0 0", fontSize: 15, lineHeight: 1.6, color: C.muted, maxWidth: "68ch" }}>
            Ambition Angels Inc. is a California nonprofit public benefit corporation and a US 501(c)(3),
            EIN 87-2513010. The President and CEO serves as an additional voting member under Article IV of
            the Bylaws.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 15, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 17, color: C.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
}
