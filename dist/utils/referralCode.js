"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCandidate = generateCandidate;
exports.normalize = normalize;
const node_crypto_1 = require("node:crypto");
/**
 * Referral-code generation + normalization.
 *
 * Codes are generated server-side only; uniqueness is NEVER decided here — the
 * repository transaction (claimReferralCode) owns the atomic check-and-write
 * against the referralCodes/{codeLower} index. This module is pure and
 * deterministic when an RNG is injected, so services stay unit-testable.
 */
/** Prefixes a generated code may start with. */
const PREFIXES = ['FIT', 'TRN', 'GYM', 'COACH'];
/**
 * Suffix alphabet: uppercase letters + digits, EXCLUDING visually ambiguous
 * characters (0/O/1/I) so codes are easy to read aloud and type.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const defaultRng = (max) => (0, node_crypto_1.randomInt)(max);
/**
 * Produces a random, non-sequential referral code of the form PREFIX + SUFFIX,
 * e.g. `FIT7K2P9`, `TRN8X3Q`. Total length is 7–8 characters. The suffix length
 * is chosen so that every prefix yields a 7–8 char code regardless of prefix
 * length (3-char prefix → 4-char suffix = 7; 5-char prefix → 3-char suffix = 8).
 */
function generateCandidate(rng = defaultRng) {
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
function normalize(code) {
    return code.trim().toLowerCase();
}
//# sourceMappingURL=referralCode.js.map