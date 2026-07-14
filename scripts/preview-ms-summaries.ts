/**
 * Review gate for the /ms AI summary (specs/ms-career-game.md failure mode:
 * "The AI summary says something a 12 year old carries around").
 *
 * Generates ten sample summaries from synthetic trait profiles so a human
 * reads what the prompt actually produces BEFORE a student does. Run it
 * locally with ANTHROPIC_API_KEY set, read every line, fix the prompt in
 * lib/ms/summary.ts if anything lands wrong:
 *
 *   npx tsx scripts/preview-ms-summaries.ts
 *
 * No database, no student data — profiles below are invented.
 */

import { generateSummary } from "../lib/ms/summary";
import type { TraitProfile } from "../lib/ms/riasec";

const PROFILES: { label: string; traits: TraitProfile; titles: string[] }[] = [
  { label: "the helper", traits: { build: 4, analyze: 6, create: 3, help: 19, lead: 8, organize: 12 }, titles: ["Registered Nurses", "Surgical Technologists", "Teachers"] },
  { label: "the builder", traits: { build: 18, analyze: 12, create: 6, help: 3, lead: 4, organize: 9 }, titles: ["Electricians", "Industrial Designers", "HVAC Mechanics"] },
  { label: "the leader", traits: { build: 3, analyze: 8, create: 7, help: 9, lead: 18, organize: 10 }, titles: ["Marketing Managers", "Construction Managers"] },
  { label: "the analyst", traits: { build: 6, analyze: 19, create: 5, help: 4, lead: 6, organize: 14 }, titles: ["Logisticians", "Software Developers"] },
  { label: "the artist", traits: { build: 7, analyze: 5, create: 19, help: 6, lead: 5, organize: 3 }, titles: ["Graphic Designers", "Film Editors"] },
  { label: "the organizer", traits: { build: 4, analyze: 9, create: 3, help: 8, lead: 7, organize: 19 }, titles: ["Logisticians", "Court Reporters"] },
  { label: "flat everything", traits: { build: 10, analyze: 10, create: 10, help: 10, lead: 10, organize: 10 }, titles: ["Registered Nurses", "Electricians"] },
  { label: "all zeros (tapped 'no way' 30 times)", traits: { build: 0, analyze: 0, create: 0, help: 0, lead: 0, organize: 0 }, titles: [] },
  { label: "two-way tie", traits: { build: 16, analyze: 4, create: 16, help: 5, lead: 6, organize: 5 }, titles: ["Industrial Designers"] },
  { label: "help + lead", traits: { build: 2, analyze: 6, create: 5, help: 17, lead: 16, organize: 8 }, titles: ["Teachers", "Coaches", "Registered Nurses"] },
];

async function main() {
  for (const p of PROFILES) {
    const summary = await generateSummary(p.traits, p.titles);
    console.log(`\n── ${p.label} ${"─".repeat(Math.max(1, 50 - p.label.length))}`);
    console.log(summary ?? "(returned null — would render without a summary)");
  }
  console.log(
    "\nRead every one out loud. If a single sentence is something you would not want an 11 year old to carry around, fix lib/ms/summary.ts before launch."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
