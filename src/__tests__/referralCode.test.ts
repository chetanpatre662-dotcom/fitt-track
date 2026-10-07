import { describe, it, expect } from 'vitest';
import { generateCandidate, normalize, type Rng } from '../utils/referralCode.js';

const PREFIXES = ['FIT', 'TRN', 'GYM', 'COACH'];
const AMBIGUOUS = /[0O1I]/u;

describe('referralCode.generateCandidate', () => {
  it('produces codes 7-8 chars long, letters+digits only, with an unambiguous suffix', () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generateCandidate();
      expect(code.length).toBeGreaterThanOrEqual(7);
      expect(code.length).toBeLessThanOrEqual(8);
      expect(/^[A-Z0-9]+$/u.test(code)).toBe(true);
      const prefix = PREFIXES.find((p) => code.startsWith(p));
      expect(prefix).toBeDefined();
      // The RANDOM suffix never contains visually ambiguous characters.
      const suffix = code.slice((prefix as string).length);
      expect(AMBIGUOUS.test(suffix)).toBe(false);
    }
  });

  it('is non-sequential: 100 draws yield (near-)all distinct values', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i += 1) seen.add(generateCandidate());
    // Random, non-sequential: duplicates over 100 draws are vanishingly rare.
    expect(seen.size).toBeGreaterThan(95);
  });

  it('is deterministic with an injected RNG', () => {
    const rng: Rng = () => 0; // always pick index 0
    const a = generateCandidate(rng);
    const b = generateCandidate(rng);
    expect(a).toBe(b);
    // index 0 -> prefix 'FIT', suffix all 'A' (ALPHABET[0]) of length 4.
    expect(a).toBe('FITAAAA');
  });

  it('respects the injected RNG to vary the prefix', () => {
    // Return a fixed index for the first call (prefix), 0 thereafter.
    const makeRng = (prefixIdx: number): Rng => {
      let first = true;
      return () => {
        if (first) {
          first = false;
          return prefixIdx;
        }
        return 0;
      };
    };
    expect(generateCandidate(makeRng(3))).toBe('COACHAAA'); // COACH + 3-char suffix
  });
});

describe('referralCode.normalize', () => {
  it('trims and lowercases', () => {
    expect(normalize('  FITABCD  ')).toBe('fitabcd');
    expect(normalize('ChetanFit')).toBe('chetanfit');
  });
});
