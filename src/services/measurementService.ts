import { admin } from '../config/firebase.js';
import { measurementRepository } from '../repositories/measurementRepository.js';
import type { MeasurementCreateInput } from '../validators/measurementValidators.js';

/**
 * Body-measurement history. Appends dated height/weight records (never
 * overwrites) so the Progress report can show trends over time.
 *
 * `type: 'body'` is stamped so the existing (type, measuredAt) composite index
 * is used and future measurement types can coexist.
 */
export class MeasurementService {
  async add(uid: string, input: MeasurementCreateInput): Promise<Record<string, unknown>> {
    const id = measurementRepository.newId(uid);
    const measuredAt = input.measuredAt ? new Date(input.measuredAt) : new Date();
    return measurementRepository.add(uid, id, {
      type: 'body',
      measuredAt: admin.firestore.Timestamp.fromDate(measuredAt),
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      note: input.note ?? null,
    });
  }

  async list(uid: string): Promise<Record<string, unknown>[]> {
    const rows = await measurementRepository.list(uid);
    // Normalize measuredAt to ISO for the client.
    return rows.map((r) => ({
      ...r,
      measuredAt: toIso(r.measuredAt),
    }));
  }
}

function toIso(value: unknown): string | null {
  const t = value as admin.firestore.Timestamp | undefined;
  if (t && typeof t.toDate === 'function') return t.toDate().toISOString();
  if (typeof value === 'string') return value;
  return null;
}

export const measurementService = new MeasurementService();
