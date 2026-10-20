import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the structured logger so we can capture exactly what the diagnostic
// logging emits, and assert it contains safe validation detail while never
// containing request body VALUES, Authorization headers, or tokens.
const warnCalls: Array<{ obj: unknown; msg?: string }> = [];
vi.mock('../utils/logger.js', () => ({
  logger: {
    warn: vi.fn((obj: unknown, msg?: string) => {
      warnCalls.push({ obj, msg });
    }),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import type { Request, Response } from 'express';
import { z } from 'zod';
import { errorHandler } from '../middleware/errorHandler.js';

/** Minimal Response double capturing status + json payload. */
function fakeRes(): Response & { _status?: number; _json?: unknown } {
  const res = {} as Response & { _status?: number; _json?: unknown };
  res.status = ((code: number) => {
    res._status = code;
    return res;
  }) as Response['status'];
  res.json = ((payload: unknown) => {
    res._json = payload;
    return res;
  }) as Response['json'];
  return res;
}

/** A request double carrying a SENSITIVE body + auth header to prove they are not logged. */
function fakeReq(): Request {
  return {
    method: 'PUT',
    originalUrl: '/api/workouts/rLORXW1UHQtf8QQJAgi9',
    headers: { authorization: 'Bearer super-secret-firebase-token-DO-NOT-LOG' },
    body: {
      name: 'Secret Leg Day',
      exercises: [
        {
          exerciseId: 'barbell-squat',
          order: 0,
          sets: [{ setNumber: 1, weightKg: 100, reps: 8, setType: 'drop', dropStages: [{ weightKg: 80, reps: 6.5 }] }],
        },
      ],
    },
  } as unknown as Request;
}

describe('errorHandler TEMP-422-DIAG logging', () => {
  beforeEach(() => {
    warnCalls.length = 0;
  });

  it('logs safe validation issue detail (path, code, message, expected/received type) on a ZodError', () => {
    // A schema that mirrors the real failure mode: an integer reps constraint.
    const schema = z.object({ reps: z.number().int() });
    let zerr: unknown;
    try {
      schema.parse({ reps: 6.5 });
    } catch (e) {
      zerr = e;
    }

    const res = fakeRes();
    errorHandler(zerr, fakeReq(), res, (() => {}) as never);

    // Status + response contract unchanged.
    expect(res._status).toBe(422);
    expect((res._json as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    // Exactly one diagnostic warn with the safe issue shape.
    expect(warnCalls).toHaveLength(1);
    const logged = warnCalls[0].obj as {
      tag: string;
      method: string;
      path: string;
      issues: Array<{ path: string; code: string; message: string; expected?: string; received?: string }>;
    };
    expect(logged.tag).toBe('TEMP-422-DIAG');
    expect(logged.method).toBe('PUT');
    expect(logged.path).toBe('/api/workouts/rLORXW1UHQtf8QQJAgi9');
    expect(logged.issues).toHaveLength(1);
    expect(logged.issues[0].path).toBe('reps');
    expect(logged.issues[0].code).toBe('invalid_type');
    expect(logged.issues[0].expected).toBe('integer');
    expect(logged.issues[0].received).toBe('float');
    expect(logged.issues[0].message).toMatch(/integer/i);
  });

  it('never logs the request body values, Authorization header, or token', () => {
    const schema = z.object({ reps: z.number().int() });
    let zerr: unknown;
    try {
      schema.parse({ reps: 6.5 });
    } catch (e) {
      zerr = e;
    }

    errorHandler(zerr, fakeReq(), fakeRes(), (() => {}) as never);

    const serialized = JSON.stringify(warnCalls);
    // No token / auth header.
    expect(serialized).not.toContain('super-secret-firebase-token-DO-NOT-LOG');
    expect(serialized.toLowerCase()).not.toContain('authorization');
    expect(serialized).not.toContain('Bearer');
    // No body VALUES (names, exercise ids, weights) — only the field PATH 'reps'
    // and type names are logged, never the payload contents.
    expect(serialized).not.toContain('Secret Leg Day');
    expect(serialized).not.toContain('barbell-squat');
    expect(serialized).not.toContain('super-secret');
    // 'received' is the Zod type name "float", not the value 6.5.
    expect(serialized).not.toContain('6.5');
  });

  it('does not emit diagnostic logging for a non-Zod error (behavior preserved)', () => {
    errorHandler(new Error('boom'), fakeReq(), fakeRes(), (() => {}) as never);
    const diag = warnCalls.filter((c) => (c.obj as { tag?: string })?.tag === 'TEMP-422-DIAG');
    expect(diag).toHaveLength(0);
  });
});
