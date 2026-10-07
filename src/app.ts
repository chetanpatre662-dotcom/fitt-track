import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { corsOrigins } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { globalLimiter } from './middleware/rateLimit.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import exerciseRoutes from './routes/exercise.routes.js';
import workoutRoutes from './routes/workout.routes.js';
import progressRoutes from './routes/progress.routes.js';
import nutritionRoutes from './routes/nutrition.routes.js';
import waterRoutes from './routes/water.routes.js';
import routineRoutes from './routes/routine.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import gameRoutes from './routes/game.routes.js';
import aiRoutes from './routes/ai.routes.js';
import trainerRoutes from './routes/trainer.routes.js';
import studentRoutes from './routes/student.routes.js';

/**
 * Builds the Express application. Route modules are mounted here as they are
 * implemented in later slices (auth, profile, workouts, exercises, nutrition,
 * water, routines, progress, ai, notifications).
 */
export function createApp(): Application {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        // Mobile apps send no Origin header; allow those and configured web origins.
        if (!origin || corsOrigins.includes(origin) || corsOrigins.includes('*')) {
          cb(null, true);
          return;
        }
        cb(new Error(`Origin not allowed by CORS: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger }));

  app.use('/api', globalLimiter);

  // --- Routes ---
  app.use('/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/exercises', exerciseRoutes);
  app.use('/api/workouts', workoutRoutes);
  app.use('/api/progress', progressRoutes);
  app.use('/api/nutrition', nutritionRoutes);
  app.use('/api/water', waterRoutes);
  app.use('/api/routines', routineRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/trainer', trainerRoutes);
  app.use('/api/student', studentRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
