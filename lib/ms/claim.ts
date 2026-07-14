/**
 * The six-character claim code — the artifact that cannot get lost
 * (specs/ms-career-game.md locked decision 9). A kid writes it on his hand;
 * an adult reads it back over the phone. So: no 0/O, no 1/I/L, no U/V
 * confusion pairs, uppercase only. 28^6 ≈ 481M codes; collisions are
 * handled by retrying the unique insert, not by prayer.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXZ";

// Web Crypto instead of node:crypto — client components import this module
// (for normalizeClaimCode and the length constants), and a node: import here
// breaks their webpack build. Rejection sampling keeps the draw unbiased.
function randomIndex(max: number): number {
  const limit = 256 - (256 % max);
  const buf = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export const CLAIM_CODE_LENGTH = 6;

export function newClaimCode(): string {
  let code = "";
  for (let i = 0; i < CLAIM_CODE_LENGTH; i++) {
    code += ALPHABET[randomIndex(ALPHABET.length)];
  }
  return code;
}

/** Normalize what a human typed: trim, uppercase, drop spaces and dashes. */
export function normalizeClaimCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Room codes (Phase 5): four characters from the same unambiguous alphabet
 * — short enough to type off a projected screen in seconds, and rooms
 * expire in hours so the smaller space (28^4 ≈ 614k) never gets crowded.
 */
export const ROOM_CODE_LENGTH = 4;

export function newRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ALPHABET[randomIndex(ALPHABET.length)];
  }
  return code;
}
