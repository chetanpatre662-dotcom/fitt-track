import { randomInt } from 'node:crypto';

/**
 * Referral-code generation + normalization.
 *
 * Codes are generated server-side only; uniqueness is NEVER decided here — the
 * repository transaction (claimReferralCode) owns the atomic check-and-write
 * against the referralCodes/{codeLower} index. This module is pure and
 * deterministic when an RNG is injected, so services stay unit-testable.
 */

/** Prefixes a generated code may start with. */
const PREFIXES = ['FIT', 'TRN', 'GYM', 'COACH'] as const;

/**
 * Suffix alphabet: uppercase letters + digits, EXCLUDING visually ambiguous
 * characters (0/O/1/I) so codes are easy to read aloud and type.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Injectable random source: given an exclusive upper bound `max`, returns an
 * integer in [0, max). Defaults to Node's crypto.randomInt (CSPRNG,
 * non-sequential, unpredictable). Tests inject a deterministic generator.
 */
export type Rng = (max: number) => number;

const defaultRng: Rng = (max) => randomInt(max);

/**
 * Produces a random, non-sequential referral code of the form PREFIX + SUFFIX,
 * e.g. `FIT7K2P9`, `TRN8X3Q`. Total length is 7–8 characters. The suffix length
 * is chosen so that every prefix yields a 7–8 char code regardless of prefix
 * length (3-char prefix → 4-char suffix = 7; 5-char prefix → 3-char suffix = 8).
 */
export function generateCandidate(rng: Rng = defaultRng): string {
  const prefix = PREFIXES[rng(PREFIXES.length)];
  // Keep the total length in [7, 8] for every prefix: suffix length = 7 - prefix
  // length when that is >= 3, otherwise 3 (so COACH, length 5, gives 5+3 = 8).
  const suffixLen = Math.max(3, 7 - prefix.length);
  let suffix = '';
  for (let i = 0; i < suffixLen; i += 1) {
    suffix += ALPHABET[rng(ALPHABET.length)];
  }
  return `${prefix}${suffix}`;
}

/** Normalizes a code to its index key form (trimmed, lowercased). */
export function normalize(code: string): string {
  return code.trim().toLowerCase();
}
