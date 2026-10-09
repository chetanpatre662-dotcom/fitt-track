import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory Firestore mock supporting users/{uid}, trainers/{uid}, and
// trainerLinks/{uid} docs. RoleService reads users/{uid}.role (via
// userRepository.getRole), checks trainers/{uid} existence, and reads
// trainerLinks/{uid} (via trainerLinkRepository.get) to derive 'student'.

interface Store {
  users: Map<string, Record<string, unknown>>;
  trainers: Map<string, Record<string, unknown>>;
  trainerLinks: Map<string, Record<string, unknown>>;
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
        const col =
          name === 'trainers'
            ? store.trainers
            : name === 'trainerLinks'
              ? store.trainerLinks
              : store.users;
        return docRef(col, id);
      },
    }),
  }),
  admin: { firestore: { FieldValue: { serverTimestamp: () => ({}) } } },
}));

import { roleService } from '../services/roleService.js';

beforeEach(() => {
  store = { users: new Map(), trainers: new Map(), trainerLinks: new Map() };
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

  it("resolves a legacy account (no role, no trainer doc, no link) to 'user'", async () => {
    store.users.set('u4', { email: 'legacy@example.com' });
    expect(await roleService.resolveRole('u4')).toBe('user');
  });

  it("resolves a missing account to 'user'", async () => {
    expect(await roleService.resolveRole('ghost')).toBe('user');
  });

  it("resolves to 'student' when a non-terminal trainerLink is active", async () => {
    store.users.set('stu-a', {});
    store.trainerLinks.set('stu-a', { trainerId: 't1', status: 'active' });
    expect(await roleService.resolveRole('stu-a')).toBe('student');
  });

  it("resolves to 'student' when a trainerLink is pending", async () => {
    store.users.set('stu-p', {});
    store.trainerLinks.set('stu-p', { trainerId: 't1', status: 'pending' });
    expect(await roleService.resolveRole('stu-p')).toBe('student');
  });

  it("resolves to 'user' when a trainerLink is rejected", async () => {
    store.users.set('stu-r', {});
    store.trainerLinks.set('stu-r', { trainerId: 't1', status: 'rejected' });
    expect(await roleService.resolveRole('stu-r')).toBe('user');
  });

  it("resolves to 'user' when a trainerLink is inactive", async () => {
    store.users.set('stu-i', {});
    store.trainerLinks.set('stu-i', { trainerId: 't1', status: 'inactive' });
    expect(await roleService.resolveRole('stu-i')).toBe('user');
  });

  it("resolves to 'trainer' when both a trainers doc and a trainerLink exist (step 2 before step 4)", async () => {
    store.users.set('mix', {});
    store.trainers.set('mix', { name: 'Edge Trainer' });
    store.trainerLinks.set('mix', { trainerId: 't1', status: 'active' });
    expect(await roleService.resolveRole('mix')).toBe('trainer');
  });
});
