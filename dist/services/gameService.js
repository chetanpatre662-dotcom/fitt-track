"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameService = exports.GameService = void 0;
const gameRepository_js_1 = require("../repositories/gameRepository.js");
const streakCalc_js_1 = require("../utils/streakCalc.js");
class GameService {
    async record(uid, input) {
        return gameRepository_js_1.gameRepository.add(uid, { ...input, alarmId: input.alarmId ?? null });
    }
    /** Recent history plus the current success streak. */
    async summary(uid) {
        const history = await gameRepository_js_1.gameRepository.listRecent(uid, 90);
        const successDates = history
            .filter((h) => h.success === true)
            .map((h) => h.dateKey)
            .filter(Boolean);
        return { history: history.slice(0, 30), streak: (0, streakCalc_js_1.computeStreak)(successDates) };
    }
}
exports.GameService = GameService;
exports.gameService = new GameService();
//# sourceMappingURL=gameService.js.map