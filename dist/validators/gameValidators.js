"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameResultSchema = void 0;
const zod_1 = require("zod");
const GAME_IDS = [
    'memoryMatch',
    'quickMath',
    'numberSequence',
    'patternMemory',
    'reactionTest',
    'quickTap',
    'colorShapeMemory',
    'wordScramble',
    'logicPuzzle',
    'simon',
];
exports.gameResultSchema = zod_1.z.object({
    gameId: zod_1.z.enum(GAME_IDS),
    success: zod_1.z.boolean(),
    difficulty: zod_1.z.enum(['easy', 'medium', 'hard']),
    score: zod_1.z.number().int().min(0).max(1_000_000),
    durationSeconds: zod_1.z.number().int().min(0).max(86_400),
    attempts: zod_1.z.number().int().min(0).max(10_000),
    alarmId: zod_1.z.number().int().optional().nullable(),
    dateKey: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
});
//# sourceMappingURL=gameValidators.js.map