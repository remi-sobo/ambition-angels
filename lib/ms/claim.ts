import { randomInt } from "node:crypto";

/**
 * The six-character claim code — the artifact that cannot get lost
 * (specs/ms-career-game.md locked decision 9). A kid writes it on his hand;
 * an adult reads it back over the phone. So: no 0/O, no 1/I/L, no U/V
 * confusion pairs, uppercase only. 28^6 ≈ 481M codes; collisions are
 * handled by retrying the unique insert, not by prayer.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXZ";

export const CLAIM_CODE_LENGTH = 6;

export function newClaimCode(): string {
  let code = "";
  for (let i = 0; i < CLAIM_CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/** Normalize what a human typed: trim, uppercase, drop spaces and dashes. */
export function normalizeClaimCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
