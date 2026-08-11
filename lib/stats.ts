/**
 * Single source of truth for the headline impact numbers.
 *
 * These were previously hardcoded across `/`, `/the-app`, `/donate`,
 * `/impact`, `/companies`, and `/update` and had already drifted
 * (e.g. "36" vs "36+" partners). Import from here so every surface stays
 * in sync — update a number once and it changes everywhere.
 */

export type Stat = {
  /** Display value, e.g. "3,500+", "87%". Drives AnimatedCounter. */
  value: string;
  /** Short label shown under the number. */
  label: string;
  /** Optional clarifying footnote (used on the future-orientation stat). */
  note?: string;
};

export const STATS = {
  teensReached: { value: "3,500+", label: "Teens reached" },
  titleI: { value: "87%", label: "From Title I schools" },
  futureOrientation: {
    value: "14%",
    label: "Increase in action orientation",
    note: "The piece of future orientation we track most closely: teens taking real steps toward a career",
  },
  hoursDelivered: { value: "1,100+", label: "Hours of career exploration delivered" },
  partners: { value: "36+", label: "School and nonprofit partners" },
  secondInternship: { value: "74%", label: "Start a second internship" },
} satisfies Record<string, Stat>;

/** The four-up bar used on the homepage, /the-app, /donate, and /companies. */
export const HEADLINE_STATS: Stat[] = [
  STATS.teensReached,
  STATS.titleI,
  STATS.futureOrientation,
  STATS.hoursDelivered,
];
