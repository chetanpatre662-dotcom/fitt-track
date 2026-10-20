import { describe, it, expect } from 'vitest';
import { EXERCISES } from '../data/exerciseSeed.js';
import { ExerciseService, exerciseService } from '../services/exerciseService.js';
import { MUSCLE_GROUPS, EQUIPMENT, type MuscleGroup } from '../models/domain.js';

/**
 * Comprehensive coverage tests for the expanded exercise catalogue.
 * Search is in-memory, case-insensitive SUBSTRING matching over the joined
 * haystack [name, primaryMuscle, ...secondaryMuscles, ...keywords]; a spaced
 * query is NOT bridged across spaces/hyphens in the name, so the required
 * multi-word phrases must live verbatim in keywords.
 */

const find = (q: string) => ExerciseService.applyFilters(EXERCISES, { q }).map((e) => e.id);

// Locked count floor + per-group minimums from the approved design (§2).
const COUNT_FLOOR = 170;
const GROUP_MINIMUMS: Record<MuscleGroup, number> = {
  chest: 26,
  back: 22,
  shoulders: 17,
  biceps: 16,
  triceps: 15,
  legs: 24,
  glutes: 9,
  core: 17,
  full_body: 11,
  cardio: 13,
};

describe('exercise catalogue — counts & integrity', () => {
  it('meets the locked total count floor', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(COUNT_FLOOR);
    // Keep comfortably under the 500 cap.
    expect(EXERCISES.length).toBeLessThan(500);
  });

  it('meets every per-group primaryMuscle minimum', () => {
    for (const g of MUSCLE_GROUPS) {
      const count = EXERCISES.filter((e) => e.primaryMuscle === g).length;
      const min = GROUP_MINIMUMS[g] ?? 0;
      expect(count, `group ${g} has ${count}, needs >= ${min}`).toBeGreaterThanOrEqual(min);
    }
  });

  it('has no duplicate ids', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate names (case-insensitive)', () => {
    const names = EXERCISES.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('every entry is well-formed', () => {
    for (const e of EXERCISES) {
      expect(e.id).toBeTruthy();
      expect(e.name).toBeTruthy();
      expect(e.instructions.length).toBeGreaterThan(0);
      expect(e.keywords.length).toBeGreaterThan(0);
      expect(e.recommendedSets).toBeGreaterThan(0);
      expect(e.recommendedRepMin).toBeLessThanOrEqual(e.recommendedRepMax);
      expect(e.secondaryMuscles).not.toContain(e.primaryMuscle);
      expect(MUSCLE_GROUPS).toContain(e.primaryMuscle);
      expect(MUSCLE_GROUPS).toContain(e.category);
      for (const m of e.secondaryMuscles) expect(MUSCLE_GROUPS).toContain(m);
      for (const eq of e.equipment) expect(EQUIPMENT).toContain(eq);
    }
  });
});

describe('exercise catalogue — data-quality fixes preserved', () => {
  it('incline-machine-press renamed, no duplicate "Incline Barbell Bench Press"', () => {
    const machine = EXERCISES.find((e) => e.id === 'incline-machine-press')!;
    expect(machine.name).toBe('Incline Machine Chest Press');
    expect(machine.equipment).toEqual(['machine']);
    const nameCount = EXERCISES.filter((e) => e.name === 'Incline Barbell Bench Press').length;
    expect(nameCount).toBe(1); // only incline-barbell-press keeps that name
  });

  it('dumbbell-deadlift uses dumbbell equipment', () => {
    const e = EXERCISES.find((x) => x.id === 'dumbbell-deadlift')!;
    expect(e.equipment).toEqual(['dumbbell']);
  });

  it('rope-hammer-curl uses cable equipment', () => {
    const e = EXERCISES.find((x) => x.id === 'rope-hammer-curl')!;
    expect(e.equipment).toEqual(['cable']);
    expect(e.keywords).toContain('rope');
  });

  it('concentration-curl is Title Case', () => {
    const e = EXERCISES.find((x) => x.id === 'concentration-curl')!;
    expect(e.name).toBe('Concentration Curl');
  });

  it('legacy Behind-neck id preserved with a corrected name', () => {
    const e = EXERCISES.find((x) => x.id === 'Behind-neck')!;
    expect(e).toBeDefined();
    expect(e.name).toBe('Behind-the-neck Overhead Press');
  });
});

describe('exercise catalogue — search', () => {
  it('T1 exact-name search returns the right entry', () => {
    expect(find('Barbell Incline Bench Press')).toContain('barbell-incline-bench-press');
    expect(find('Machine Chest Press')).toContain('machine-chest-press');
  });

  it('T2 alias/keyword search', () => {
    expect(find('db bench')).toContain('dumbbell-flat-bench-press');
    const smith = find('smith');
    for (const id of ['smith-flat-bench-press', 'smith-incline-bench-press', 'smith-decline-bench-press']) {
      expect(smith).toContain(id);
    }
  });

  it('T3 case-insensitive search', () => {
    const lower = find('barbell bench press');
    const mixed = find('BARBELL bench PRESS');
    expect(new Set(mixed)).toEqual(new Set(lower));
    expect(lower).toContain('barbell-bench-press');
  });

  it('T4 partial substring search finds all incline variants', () => {
    const incline = find('incline');
    for (const id of [
      'barbell-incline-bench-press',
      'dumbbell-incline-bench-press',
      'incline-machine-press',
      'incline-dumbbell-press',
    ]) {
      expect(incline).toContain(id);
    }
  });

  it('T5 spelling / spacing variants', () => {
    expect(find('flye').length).toBeGreaterThan(0);
    expect(find('pushup')).toContain('push-up');
    expect(find('push up')).toContain('push-up');
    expect(find('tricep').length).toBeGreaterThan(0);
  });

  it('T6a "neutral grip bench press" returns the neutral-grip entry', () => {
    expect(find('neutral grip bench press')).toContain('neutral-grip-dumbbell-bench-press');
  });

  it('T6b "incline press" returns every mandated incline entry', () => {
    const res = find('incline press');
    for (const id of [
      'barbell-incline-bench-press',
      'dumbbell-incline-bench-press',
      'neutral-grip-incline-dumbbell-press',
      'smith-incline-bench-press',
      'incline-dumbbell-press',
      'incline-machine-press',
    ]) {
      expect(res).toContain(id);
    }
  });

  it('T6c "decline dumbbell press" returns the decline dumbbell entry', () => {
    expect(find('decline dumbbell press')).toContain('dumbbell-decline-bench-press');
  });

  it('T6d required chest entries all exist', () => {
    const ids = EXERCISES.map((e) => e.id);
    for (const id of [
      'barbell-bench-press',
      'barbell-incline-bench-press',
      'barbell-decline-bench-press',
      'dumbbell-flat-bench-press',
      'dumbbell-incline-bench-press',
      'dumbbell-decline-bench-press',
      'neutral-grip-dumbbell-bench-press',
      'neutral-grip-incline-dumbbell-press',
      'smith-flat-bench-press',
      'smith-incline-bench-press',
      'smith-decline-bench-press',
      'wide-grip-bench-press',
      'machine-chest-press',
      'cable-chest-press',
      'close-grip-bench-press',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('T6e required phrases live verbatim in keywords', () => {
    const kw = (id: string) => EXERCISES.find((e) => e.id === id)!.keywords;
    expect(kw('neutral-grip-dumbbell-bench-press')).toContain('neutral grip bench press');
    expect(kw('dumbbell-decline-bench-press')).toContain('decline dumbbell press');
    for (const id of [
      'barbell-incline-bench-press',
      'dumbbell-incline-bench-press',
      'neutral-grip-incline-dumbbell-press',
      'smith-incline-bench-press',
      'incline-dumbbell-press',
      'incline-machine-press',
    ]) {
      expect(kw(id)).toContain('incline press');
    }
  });

  it('flat / decline bench variants are searchable', () => {
    expect(find('flat bench press')).toContain('dumbbell-flat-bench-press');
    expect(find('flat bench press')).toContain('neutral-grip-dumbbell-bench-press');
    expect(find('decline press')).toContain('barbell-decline-bench-press');
    expect(find('decline press')).toContain('smith-decline-bench-press');
  });

  it('twister / oblique rotation entries are searchable', () => {
    const twister = find('twister');
    for (const id of [
      'standing-twister-machine',
      'sitting-twister-machine',
      'cable-twister-low-to-high',
      'cable-twister-high-to-low',
      'dumbbell-twister-low-to-high',
      'dumbbell-twister-high-to-low',
    ]) {
      expect(twister).toContain(id);
    }
    expect(find('oblique').length).toBeGreaterThan(0);
  });
});

describe('exercise catalogue — catalogue + search expansion (§6/§7)', () => {
  it('adds exactly the two new ids with unique, well-formed entries', () => {
    const ids = EXERCISES.map((e) => e.id);
    for (const id of ['low-to-high-cable-fly', 'sled-push']) {
      expect(ids).toContain(id);
      // ids remain unique even with the additions
      expect(ids.filter((x) => x === id).length).toBe(1);
    }
  });

  it('low-to-high-cable-fly is a valid chest entry', () => {
    const e = EXERCISES.find((x) => x.id === 'low-to-high-cable-fly')!;
    expect(e.name).toBe('Low to High Cable Fly');
    expect(e.primaryMuscle).toBe('chest');
    expect(e.category).toBe('chest');
    expect(e.equipment).toEqual(['cable']);
  });

  it('sled-push is pinned to legs/cardio with valid enum values only', () => {
    const e = EXERCISES.find((x) => x.id === 'sled-push')!;
    expect(e.name).toBe('Sled Push');
    expect(e.primaryMuscle).toBe('legs');
    expect(e.category).toBe('cardio');
    expect(e.type).toBe('cardio');
    expect(e.equipment).toEqual(['machine']);
    // never the invalid tokens the user might expect
    expect(e.equipment).not.toContain('sled');
    expect(e.equipment).not.toContain('functional');
    expect(e.equipment).not.toContain('other');
  });

  it('locks the expanded group counts (chest 31, legs 25, cardio 13, total 193)', () => {
    const byPrimary = (g: MuscleGroup) => EXERCISES.filter((e) => e.primaryMuscle === g).length;
    // 182 original + 6 (2 chest, 3 back, 1 biceps) + 5 FEAT-003 (1 biceps, 4 triceps) = 193.
    expect(EXERCISES.length).toBe(193);
    expect(byPrimary('chest')).toBe(31);
    expect(byPrimary('legs')).toBe(25);
    expect(byPrimary('cardio')).toBe(13);
  });

  it('new search aliases resolve to the expected exercise(s)', () => {
    expect(find('low to high cable fly')).toContain('low-to-high-cable-fly');
    expect(find('sled')).toContain('sled-push');
    expect(find('prowler')).toContain('sled-push');
  });

  it('"seated twister" resolves to the sitting twister machine', () => {
    expect(find('seated twister')).toContain('sitting-twister-machine');
    expect(find('seated twister machine')).toContain('sitting-twister-machine');
  });

  it('"cable twister" resolves to both cable twister entries', () => {
    const res = find('cable twister');
    expect(res).toContain('cable-twister-low-to-high');
    expect(res).toContain('cable-twister-high-to-low');
  });

  it('preserves existing ids after the expansion', () => {
    const ids = EXERCISES.map((e) => e.id);
    for (const id of [
      'cable-twister-low-to-high',
      'cable-twister-high-to-low',
      'sitting-twister-machine',
      'high-to-low-cable-crossover',
      'battle-ropes',
    ]) {
      expect(ids).toContain(id);
    }
  });
});

describe('exercise catalogue — eight-exercises feature', () => {
  const NEW_IDS = [
    'incline-machine-fly',
    'low-to-high-dumbbell-fly',
    'spider-hammer-curl',
    'one-arm-cable-row',
    'straight-arm-lat-pulldown',
    'single-hand-dumbbell-row',
  ];
  const PRE_EXISTING_IDS = ['low-to-high-cable-fly', 'dumbbell-deadlift'];

  it('adds the six new ids exactly once each', () => {
    const ids = EXERCISES.map((e) => e.id);
    for (const id of NEW_IDS) {
      expect(ids).toContain(id);
      expect(ids.filter((x) => x === id).length).toBe(1);
    }
  });

  it('does NOT duplicate the two pre-existing ids', () => {
    const ids = EXERCISES.map((e) => e.id);
    for (const id of PRE_EXISTING_IDS) {
      expect(ids.filter((x) => x === id).length).toBe(1);
    }
  });

  it('keeps all ids unique and all names unique (exact case-sensitive)', () => {
    const ids = EXERCISES.map((e) => e.id);
    const names = EXERCISES.map((e) => e.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('each new entry is found by its full lowercase name', () => {
    const byName: Record<string, string> = {
      'incline-machine-fly': 'incline machine fly',
      'low-to-high-dumbbell-fly': 'low to high dumbbell fly',
      'spider-hammer-curl': 'spider hammer curl',
      'one-arm-cable-row': 'one arm cable row',
      'straight-arm-lat-pulldown': 'straight arm lat pulldown',
      'single-hand-dumbbell-row': 'single hand dumbbell row',
    };
    for (const [id, q] of Object.entries(byName)) {
      expect(find(q), `search "${q}" should find ${id}`).toContain(id);
    }
  });

  it('each new entry is found by an alias keyword', () => {
    expect(find('pec deck')).toContain('incline-machine-fly');
    expect(find('low-to-high')).toContain('low-to-high-dumbbell-fly');
    expect(find('spider')).toContain('spider-hammer-curl');
    expect(find('unilateral')).toContain('one-arm-cable-row');
    expect(find('unilateral')).toContain('single-hand-dumbbell-row');
    expect(find('pullover')).toContain('straight-arm-lat-pulldown');
  });

  it('new entries appear under their primary muscle + equipment filters', () => {
    const byFilter = (f: Parameters<typeof ExerciseService.applyFilters>[1]) =>
      ExerciseService.applyFilters(EXERCISES, f).map((e) => e.id);
    expect(byFilter({ muscle: 'chest', equipment: 'machine' })).toContain('incline-machine-fly');
    expect(byFilter({ muscle: 'chest', equipment: 'dumbbell' })).toContain('low-to-high-dumbbell-fly');
    expect(byFilter({ muscle: 'biceps', equipment: 'dumbbell' })).toContain('spider-hammer-curl');
    expect(byFilter({ muscle: 'back', equipment: 'cable' })).toContain('one-arm-cable-row');
    expect(byFilter({ muscle: 'back', equipment: 'cable' })).toContain('straight-arm-lat-pulldown');
    expect(byFilter({ muscle: 'back', equipment: 'dumbbell' })).toContain('single-hand-dumbbell-row');
  });
});

describe('exercise catalogue — biceps/triceps expansion (FEAT-003)', () => {
  // 5 net-new ids delivered by FEAT-003 (the other 3 requested movements are
  // enriched existing entries, not new ids).
  const NEW_IDS = [
    'ez-bar-cable-curl',
    'single-arm-triceps-extension',
    'close-grip-triceps-pushdown',
    'ez-bar-triceps-extension',
    'one-arm-dumbbell-triceps-extension',
  ];
  const byId = (id: string) => EXERCISES.find((e) => e.id === id)!;

  it('adds the five new ids exactly once each, no duplicates', () => {
    const ids = EXERCISES.map((e) => e.id);
    for (const id of NEW_IDS) {
      expect(ids, `missing ${id}`).toContain(id);
      expect(ids.filter((x) => x === id).length, `duplicate ${id}`).toBe(1);
    }
    // whole-catalogue id uniqueness still holds after the additions
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each new entry has the correct primaryMuscle and equipment', () => {
    expect(byId('ez-bar-cable-curl').primaryMuscle).toBe('biceps');
    expect(byId('ez-bar-cable-curl').equipment).toEqual(['cable', 'ez_bar']);
    expect(byId('single-arm-triceps-extension').primaryMuscle).toBe('triceps');
    expect(byId('single-arm-triceps-extension').equipment).toEqual(['dumbbell']);
    expect(byId('close-grip-triceps-pushdown').primaryMuscle).toBe('triceps');
    expect(byId('close-grip-triceps-pushdown').equipment).toEqual(['cable']);
    expect(byId('ez-bar-triceps-extension').primaryMuscle).toBe('triceps');
    expect(byId('ez-bar-triceps-extension').equipment).toEqual(['ez_bar', 'bench']);
    expect(byId('one-arm-dumbbell-triceps-extension').primaryMuscle).toBe('triceps');
    expect(byId('one-arm-dumbbell-triceps-extension').equipment).toEqual(['dumbbell']);
  });

  it('each new entry is searchable by a keyword phrase', () => {
    expect(find('ez bar cable curl')).toContain('ez-bar-cable-curl');
    expect(find('single arm triceps extension')).toContain('single-arm-triceps-extension');
    expect(find('close grip triceps pushdown')).toContain('close-grip-triceps-pushdown');
    expect(find('ez bar triceps extension')).toContain('ez-bar-triceps-extension');
    expect(find('one arm dumbbell overhead triceps extension')).toContain('one-arm-dumbbell-triceps-extension');
  });

  it('the three enriched existing movements remain searchable by their new phrases', () => {
    expect(find('ez bar biceps curl')).toContain('ez-bar-curl');
    expect(find('overhead triceps extension')).toContain('overhead-triceps-extension');
    expect(find('one arm cable triceps extension')).toContain('single-arm-cable-extension');
  });

  it('the three requested unilateral movements carry unilateral:true', () => {
    expect(byId('single-arm-triceps-extension').unilateral).toBe(true);
    expect(byId('one-arm-dumbbell-triceps-extension').unilateral).toBe(true);
    expect(byId('single-arm-cable-extension').unilateral).toBe(true);
  });

  it('the set of seed ids flagged unilateral:true equals the canonical 8-id literal', () => {
    const flagged = new Set(EXERCISES.filter((e) => e.unilateral === true).map((e) => e.id));
    const expected = new Set([
      'one-arm-cable-row',
      'single-hand-dumbbell-row',
      'single-arm-cable-extension',
      'concentration-curl',
      'dumbbell-kickback',
      'dumbbell-row',
      'single-arm-triceps-extension',
      'one-arm-dumbbell-triceps-extension',
    ]);
    expect(flagged).toEqual(expected);
    // dumbbell-row specifically must be present (distinct from single-hand-dumbbell-row)
    expect(flagged.has('dumbbell-row')).toBe(true);
    expect(flagged.size).toBe(8);
  });
});

describe('exercise catalogue — pagination (no silent cap)', () => {
  it('returns the full set when no limit is given', async () => {
    const res = await exerciseService.list({});
    expect(res.total).toBe(EXERCISES.length);
    expect(res.items.length).toBe(res.total);
  });

  it('a limit paginates without reducing total', async () => {
    const res = await exerciseService.list({ limit: 10, offset: 0 });
    expect(res.items.length).toBe(10);
    expect(res.total).toBe(EXERCISES.length);
  });

  it('offset beyond the end returns no items but the real total', async () => {
    const res = await exerciseService.list({ offset: EXERCISES.length });
    expect(res.items.length).toBe(0);
    expect(res.total).toBe(EXERCISES.length);
  });

  it('a high limit (up to 500) returns everything', async () => {
    const res = await exerciseService.list({ limit: 500, offset: 0 });
    expect(res.items.length).toBe(EXERCISES.length);
  });
});
