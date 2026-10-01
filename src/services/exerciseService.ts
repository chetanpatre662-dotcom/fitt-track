import { hasFirebaseCredentials } from '../config/env.js';
import { EXERCISES } from '../data/exerciseSeed.js';
import type {
  Difficulty,
  Equipment,
  Exercise,
  ExerciseType,
  MuscleGroup,
  WorkoutLocation,
} from '../models/domain.js';
import { exerciseRepository } from '../repositories/exerciseRepository.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface ExerciseFilters {
  location?: WorkoutLocation | 'all';
  muscle?: MuscleGroup | 'all';
  equipment?: Equipment;
  difficulty?: Difficulty | 'all';
  type?: ExerciseType | 'all';
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * Exercise library service. Loads from Firestore when configured, otherwise
 * uses the bundled seed so the library is always usable. Applies COMBINABLE
 * filters and keyword search in-memory (the library is small and fully cached
 * client-side too, so this is fast and avoids many Firestore composite-index
 * round-trips).
 */
export class ExerciseService {
  private cache: Exercise[] | null = null;
  private cacheAt = 0;
  private static readonly TTL_MS = 5 * 60 * 1000;

  private async load(): Promise<Exercise[]> {
    const fresh = this.cache && Date.now() - this.cacheAt < ExerciseService.TTL_MS;
    if (fresh) return this.cache as Exercise[];

    if (hasFirebaseCredentials()) {
      try {
        const fromDb = await exerciseRepository.getAll();
        if (fromDb.length > 0) {
          this.cache = fromDb;
          this.cacheAt = Date.now();
          return fromDb;
        }
        logger.warn('exercises collection is empty; serving bundled seed. Run `npm run seed`.');
      } catch (err) {
        logger.warn({ err }, 'Failed to read exercises from Firestore; serving bundled seed.');
      }
    }

    this.cache = EXERCISES;
    this.cacheAt = Date.now();
    return EXERCISES;
  }

  async getById(id: string): Promise<Exercise> {
    // Try cache/seed first, then Firestore directly.
    const all = await this.load();
    const found = all.find((e) => e.id === id);
    if (found) return found;
    if (hasFirebaseCredentials()) {
      const fromDb = await exerciseRepository.getById(id);
      if (fromDb) return fromDb;
    }
    throw new NotFoundError(`Exercise not found: ${id}`);
  }

  /** Applies combinable filters + optional keyword search, then paginates. */
  async list(filters: ExerciseFilters): Promise<{ items: Exercise[]; total: number }> {
    const all = await this.load();
    const filtered = ExerciseService.applyFilters(all, filters);

    const offset = Math.max(0, filters.offset ?? 0);
    const limit = filters.limit ?? filtered.length;
    const items = filtered.slice(offset, offset + limit);
    return { items, total: filtered.length };
  }

  /**
   * Pure, testable filter function. All predicates combine with AND.
   * `location: 'both'` exercises always match a home/gym location filter.
   */
  static applyFilters(all: Exercise[], f: ExerciseFilters): Exercise[] {
    const q = f.q?.trim().toLowerCase();

    return all.filter((e) => {
      if (f.location && f.location !== 'all') {
        // An exercise tagged 'both' is available in home AND gym.
        if (e.location !== f.location && e.location !== 'both') return false;
      }
      if (f.muscle && f.muscle !== 'all') {
        const inPrimaryOrSecondary =
          e.primaryMuscle === f.muscle || e.secondaryMuscles.includes(f.muscle);
        if (!inPrimaryOrSecondary) return false;
      }
      if (f.equipment) {
        if (!e.equipment.includes(f.equipment)) return false;
      }
      if (f.difficulty && f.difficulty !== 'all') {
        if (e.difficulty !== f.difficulty) return false;
      }
      if (f.type && f.type !== 'all') {
        if (e.type !== f.type) return false;
      }
      if (q) {
        const haystack = [e.name, e.primaryMuscle, ...e.secondaryMuscles, ...e.keywords]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }
}

export const exerciseService = new ExerciseService();
