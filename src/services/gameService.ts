import { gameRepository } from '../repositories/gameRepository.js';
import { computeStreak } from '../utils/streakCalc.js';
import type { GameResultInput } from '../validators/gameValidators.js';

export class GameService {
  async record(uid: string, input: GameResultInput): Promise<Record<string, unknown>> {
    return gameRepository.add(uid, { ...input, alarmId: input.alarmId ?? null });
  }

  /** Recent history plus the current success streak. */
  async summary(uid: string): Promise<{ history: Record<string, unknown>[]; streak: number }> {
    const history = await gameRepository.listRecent(uid, 90);
    const successDates = history
      .filter((h) => h.success === true)
      .map((h) => h.dateKey as string)
      .filter(Boolean);
    return { history: history.slice(0, 30), streak: computeStreak(successDates) };
  }
}

export const gameService = new GameService();
