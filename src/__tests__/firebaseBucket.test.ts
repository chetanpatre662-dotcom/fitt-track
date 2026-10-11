import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getBucket() hardening (Progress Photos 500 fix). We mock ../config/env.js so
 * FIREBASE_STORAGE_BUCKET is controllable, and firebase-admin so initFirebase()
 * resolves to a fake app whose storage().bucket(name) is a spy. This lets us
 * assert the explicit bucket-name wiring and the 503 ConfigurationError without
 * real credentials. A separate case parses the real env schema to prove the
 * verified default is applied when the process var is absent.
 */

/**
 * Mutable env + storage spies the firebase module reads. Declared via
 * vi.hoisted so they exist before the hoisted vi.mock factories run; each test
 * sets the bucket it needs.
 */
const { mockEnv, bucketSpy, storageSpy } = vi.hoisted(() => ({
  mockEnv: {
    FIREBASE_STORAGE_BUCKET: 'fittness-ba0ac.firebasestorage.app' as string,
    FIREBASE_PROJECT_ID: 'proj' as string | undefined,
    FIREBASE_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com' as string | undefined,
    FIREBASE_PRIVATE_KEY: 'fake-key' as string | undefined,
    LOG_LEVEL: 'silent' as string,
  },
  bucketSpy: vi.fn((name?: string) => ({ name })),
  storageSpy: vi.fn(),
}));
storageSpy.mockImplementation(() => ({ bucket: bucketSpy }));

vi.mock('../config/env.js', () => ({
  env: mockEnv,
  isProduction: false,
  isTest: true,
  hasFirebaseCredentials: () => true,
  corsOrigins: [],
  hasGeminiCredentials: () => false,
}));

vi.mock('firebase-admin', () => {
  const credential = { cert: vi.fn(() => ({})) };
  const initializeApp = vi.fn(() => ({ storage: storageSpy }));
  return {
    default: { credential, initializeApp },
    credential,
    initializeApp,
  };
});

import { getBucket } from '../config/firebase.js';
import { ConfigurationError } from '../utils/errors.js';

beforeEach(() => {
  bucketSpy.mockClear();
  storageSpy.mockClear();
  mockEnv.FIREBASE_STORAGE_BUCKET = 'fittness-ba0ac.firebasestorage.app';
});

describe('getBucket()', () => {
  it('throws a 503 ConfigurationError mentioning FIREBASE_STORAGE_BUCKET when unset', () => {
    mockEnv.FIREBASE_STORAGE_BUCKET = '';
    try {
      getBucket();
      throw new Error('expected getBucket to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigurationError);
      const e = err as ConfigurationError;
      expect(e.statusCode).toBe(503);
      expect(e.code).toBe('NOT_CONFIGURED');
      expect(e.message).toContain('FIREBASE_STORAGE_BUCKET');
    }
    expect(bucketSpy).not.toHaveBeenCalled();
  });

  it('passes the configured bucket name explicitly to storage().bucket(name)', () => {
    getBucket();
    expect(bucketSpy).toHaveBeenCalledWith('fittness-ba0ac.firebasestorage.app');
  });
});

describe('env schema default', () => {
  it('defaults FIREBASE_STORAGE_BUCKET to the verified bucket when the process var is absent', async () => {
    const prev = process.env.FIREBASE_STORAGE_BUCKET;
    delete process.env.FIREBASE_STORAGE_BUCKET;
    try {
      // Import the real env module (unmocked here) with the process var absent
      // so the schema's default is exercised end-to-end.
      vi.resetModules();
      const real = await vi.importActual<typeof import('../config/env.js')>('../config/env.js');
      expect(real.env.FIREBASE_STORAGE_BUCKET).toBe('fittness-ba0ac.firebasestorage.app');
    } finally {
      if (prev === undefined) delete process.env.FIREBASE_STORAGE_BUCKET;
      else process.env.FIREBASE_STORAGE_BUCKET = prev;
    }
  });
});
