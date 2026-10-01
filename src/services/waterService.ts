import { waterRepository } from '../repositories/waterRepository.js';
import { NotFoundError } from '../utils/errors.js';
import type { WaterAddInput } from '../validators/waterValidators.js';

export class WaterService {
  /** Returns the day's water entries and the total consumed in ml. */
  async getDay(uid: string, dateKey: string) {
    const rows = await waterRepository.listByDate(uid, dateKey);
    const entries = rows.map((r) => ({
      id: r.id as string,
      amountMl: (r.amountMl as number) ?? 0,
    }));
    const totalMl = entries.reduce((sum, e) => sum + e.amountMl, 0);
    return { dateKey, entries, totalMl };
  }

  async add(uid: string, input: WaterAddInput): Promise<Record<string, unknown>> {
    return waterRepository.add(uid, { dateKey: input.dateKey, amountMl: input.amountMl });
  }

  async delete(uid: string, id: string): Promise<void> {
    const existing = await waterRepository.get(uid, id);
    if (!existing) throw new NotFoundError('Water entry not found');
    await waterRepository.delete(uid, id);
  }
}

export const waterService = new WaterService();
