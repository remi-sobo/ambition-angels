/**
 * Single source of truth for the Ambition Angels x MESA pilot pages
 * (`/mesa` and `/mesa/students`).
 *
 * Both routes import from here, so changing a value once (the launch window,
 * the cohort size, the reward) updates both pages. Keep every fill-in token in
 * this file. Do not hardcode any of these values in the page components.
 *
 * House copy rule: no em dashes anywhere. Use commas, periods, or parentheses.
 */

export const MESA = {
  /**
   * The community college where Rance runs MESA. CONFIRMED by Remi
   * (2026-06-15): Cañada College, Redwood City.
   */
  collegeName: "Cañada College",
  collegeCity: "Redwood City",

  /** MESA program director. Confirmed. */
  directorName: "Rance Bobo",

  /**
   * Student launch window. Rance sets the exact date after the Aug 28 /
   * Sept 4 orientations; until then this is the public-facing window.
   */
  launchWindow: "Mid-September 2026",

  /** Pilot cohort size. */
  studentCount: 50,

  /** Funded internships per student. */
  internshipsPerStudent: 3,

  /**
   * Gift card value per completed internship, written as a display string so
   * it can drop straight into copy and into AnimatedCounter.
   */
  rewardPerInternship: "$100",

  /** Coaching sessions for students ready to go deeper. */
  coachingSessions: 4,

  /** Partnership contact. Remi (confirmed 2026-06-15). */
  contactEmail: "remi@ambitionangels.org",

  /** Co-brand lockup label. */
  lockup: "Ambition Angels x MESA",

  /**
   * MESA logo asset (provided by Remi, transparent PNG). Coral wordmark with a
   * gray "Math · Engineering · Science" tagline, so it reads best on light
   * (cream/white) surfaces. Native size 1100 x 537.
   */
  logo: {
    src: "/images/mesa/mesa-logo.png",
    width: 1100,
    height: 537,
    alt: "MESA — Math, Engineering, Science Achievement",
  },
} as const;

export type MesaConstants = typeof MESA;
