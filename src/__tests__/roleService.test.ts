import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory Firestore mock supporting users/{uid} docs and trainers/{uid} docs.
// RoleService reads users/{uid}.role (via userRepository.getRole) and, when
// absent, checks trainers/{uid} existence.

interface Store {
  users: Map<string, Record<string, unknown>>;
  trainers: Map<string, Record<string, unknown>>;
}
let store: Store;

function docRef(col: Map<string, Record<string, unknown>>, id: string) {
  return {
    get: vi.fn(async () => ({
      exists: col.has(id),
      id,
      data: () => col.get(id),
    })),
  };
}

vi.mock('../config/firebase.js', () => ({
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => {
        const col = name === 'trainers' ? store.trainers : store.users;
        return docRef(col, id);
      },
    }),
  }),
  admin: { firestore: { FieldValue: { serverTimestamp: () => ({}) } } },
}));

import { roleService } from '../services/roleService.js';

beforeEach(() => {
  store = { users: new Map(), trainers: new Map() };
});

describe('RoleService.resolveRole', () => {
  it('returns the stored role when present', async () => {
    store.users.set('u1', { role: 'trainer' });
    expect(await roleService.resolveRole('u1')).toBe('trainer');

    store.users.set('u2', { role: 'student' });
    expect(await roleService.resolveRole('u2')).toBe('student');
  });

  it("resolves to 'trainer' when no role but a trainers/{uid} doc exists", async () => {
    store.users.set('u3', {});
    store.trainers.set('u3', { name: 'Dream Physics' });
    expect(await roleService.resolveRole('u3')).toBe('trainer');
  });

  it("resolves a legacy account (no role, no trainer doc) to 'student'", async () => {
    store.users.set('u4', { email: 'legacy@example.com' });
    expect(await roleService.resolveRole('u4')).toBe('student');
  });

  it("resolves a missing account to 'student'", async () => {
    expect(await roleService.resolveRole('ghost')).toBe('student');
  });
});
