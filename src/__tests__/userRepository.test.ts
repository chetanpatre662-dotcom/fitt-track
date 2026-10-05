import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Firebase config module with an in-memory Firestore so userRepository
// can be exercised without real credentials. We assert on the recorded set()
// calls to prove writes are conditional (audit Root Causes #4 and #5).

/** Sentinels for FieldValue so tests can recognize them in recorded patches. */
const SERVER_TIMESTAMP = { __fv: 'serverTimestamp' };
function arrayUnion(...values: unknown[]) {
  return { __fv: 'arrayUnion', values };
}
function arrayRemove(...values: unknown[]) {
  return { __fv: 'arrayRemove', values };
}

/** Recorded set() calls on the single doc under test: [data, options?]. */
let setCalls: Array<{ data: Record<string, unknown>; merge: boolean }>;
/** Current stored doc data (undefined => doc does not exist). */
let stored: Record<string, unknown> | undefined;

const docRef = {
  get: vi.fn(async () => ({
    exists: stored !== undefined,
    data: () => stored,
  })),
  set: vi.fn(async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
    setCalls.push({ data, merge: options?.merge === true });
  }),
};

vi.mock('../config/firebase.js', () => ({
  getFirestore: () => ({
    collection: () => ({ doc: () => docRef }),
    recursiveDelete: vi.fn(async () => {}),
  }),
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: () => SERVER_TIMESTAMP,
        arrayUnion: (...v: unknown[]) => arrayUnion(...v),
        arrayRemove: (...v: unknown[]) => arrayRemove(...v),
      },
    },
  },
}));

import { userRepository } from '../repositories/userRepository.js';

beforeEach(() => {
  setCalls = [];
  stored = undefined;
  docRef.get.mockClear();
  docRef.set.mockClear();
});

describe('UserRepository.ensureAccount', () => {
  it('creates the doc on first sign-in with createdAt set once', async () => {
    const { created } = await userRepository.ensureAccount({
      uid: 'uid-1',
      email: 'a@example.com',
      emailVerified: true,
      displayName: 'A',
    });

    expect(created).toBe(true);
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].data.createdAt).toBe(SERVER_TIMESTAMP);
    expect(setCalls[0].data.uid).toBe('uid-1');
  });

  it('does NOT write when email/emailVerified are unchanged', async () => {
    stored = {
      uid: 'uid-1',
      email: 'a@example.com',
      emailVerified: true,
      createdAt: 'original-created-at',
    };

    const { account, created } = await userRepository.ensureAccount({
      uid: 'uid-1',
      email: 'a@example.com',
      emailVerified: true,
      displayName: 'A',
    });

    expect(created).toBe(false);
    expect(setCalls).toHaveLength(0); // no Firestore write on unchanged reopen
    expect(account).toBe(stored);
    expect((account as Record<string, unknown>).createdAt).toBe('original-created-at');
  });

  it('writes only the changed fields when email changes, never createdAt', async () => {
    stored = {
      uid: 'uid-1',
      email: 'old@example.com',
      emailVerified: false,
      createdAt: 'original-created-at',
    };

    const { created } = await userRepository.ensureAccount({
      uid: 'uid-1',
      email: 'new@example.com',
      emailVerified: true,
      displayName: 'A',
    });

    expect(created).toBe(false);
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].merge).toBe(true);
    expect(setCalls[0].data).toMatchObject({
      email: 'new@example.com',
      emailVerified: true,
      updatedAt: SERVER_TIMESTAMP,
    });
    expect(setCalls[0].data).not.toHaveProperty('createdAt');
  });

  it('writes when only emailVerified changes', async () => {
    stored = {
      uid: 'uid-1',
      email: 'a@example.com',
      emailVerified: false,
      createdAt: 'original-created-at',
    };

    await userRepository.ensureAccount({
      uid: 'uid-1',
      email: 'a@example.com',
      emailVerified: true,
      displayName: 'A',
    });

    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].data.emailVerified).toBe(true);
  });
});

describe('UserRepository.addFcmToken', () => {
  it('is a no-op when the token is already present', async () => {
    stored = { uid: 'uid-1', fcmTokens: ['tok-A', 'tok-B'] };

    await userRepository.addFcmToken('uid-1', 'tok-A');

    expect(setCalls).toHaveLength(0);
  });

  it('writes an arrayUnion when the token is new', async () => {
    stored = { uid: 'uid-1', fcmTokens: ['tok-A'] };

    await userRepository.addFcmToken('uid-1', 'tok-NEW');

    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].merge).toBe(true);
    expect(setCalls[0].data.fcmTokens).toEqual(arrayUnion('tok-NEW'));
    expect(setCalls[0].data.updatedAt).toBe(SERVER_TIMESTAMP);
  });

  it('writes when the account has no tokens yet', async () => {
    stored = { uid: 'uid-1' };

    await userRepository.addFcmToken('uid-1', 'tok-A');

    expect(setCalls).toHaveLength(1);
  });
});
