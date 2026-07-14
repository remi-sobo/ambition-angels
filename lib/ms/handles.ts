import { randomInt } from "node:crypto";

/**
 * Room handles. The spec's room screen "fills with names" — but the v2/D9
 * rule is harder: no free text from a child ever exists, and a typed name
 * is free text. So the room assigns a handle instead. Same function on the
 * wall (kids find themselves, facilitators call tables), zero PII.
 *
 * Both lists are short, concrete, grade-5 words a kid would be fine being
 * called in front of a room. 24 × 24 = 576 combinations; uniqueness within
 * a room is enforced by the caller with retries.
 */
const ADJECTIVES = [
  "Swift", "Brave", "Quiet", "Golden", "Rapid", "Steady",
  "Bright", "Bold", "Clever", "Mighty", "Lucky", "Wild",
  "Cosmic", "Electric", "Turbo", "Mega", "Shadow", "Blazing",
  "Iron", "Neon", "Rocket", "Thunder", "Frost", "Solar",
] as const;

const ANIMALS = [
  "Fox", "Otter", "Hawk", "Wolf", "Bear", "Lynx",
  "Falcon", "Tiger", "Panda", "Raven", "Cobra", "Moose",
  "Jaguar", "Bison", "Eagle", "Shark", "Puma", "Heron",
  "Badger", "Osprey", "Mantis", "Gecko", "Condor", "Orca",
] as const;

export function newHandle(): string {
  return `${ADJECTIVES[randomInt(ADJECTIVES.length)]} ${ANIMALS[randomInt(ANIMALS.length)]}`;
}

export const HANDLE_SPACE = ADJECTIVES.length * ANIMALS.length;
