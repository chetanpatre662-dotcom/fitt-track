import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, infer as ZodInfer } from 'zod';
import { z } from 'zod';

/**
 * Builds a middleware that validates and coerces the request's body, query,
 * and/or params against Zod schemas. On success the parsed values replace the
 * originals so controllers receive typed, sanitized input. On failure a
 * ZodError propagates to the centralized error handler (→ 422).
 */
export function validate<
  B extends ZodTypeAny = ZodTypeAny,
  Q extends ZodTypeAny = ZodTypeAny,
  P extends ZodTypeAny = ZodTypeAny,
>(schemas: { body?: B; query?: Q; params?: P }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        // req.query is read-only in Express 5-style typings; assign parsed copy.
        const parsedQuery = schemas.query.parse(req.query);
        Object.defineProperty(req, 'query', { value: parsedQuery, configurable: true });
      }
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Convenience helper to type the parsed body from a schema. */
export type Body<S extends ZodTypeAny> = ZodInfer<S>;

/** Common reusable field schemas shared across validators. */
export const commonSchemas = {
  /** yyyy-MM-dd date key. */
  dateKey: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Expected date in yyyy-MM-dd format'),
  /** Firestore-safe document id. */
  id: z.string().min(1).max(1500),
  /** HH:mm 24-hour time. */
  timeOfDay: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, 'Expected time in HH:mm 24-hour format'),
};
