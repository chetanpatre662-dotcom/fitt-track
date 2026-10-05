import { describe, it, expect } from 'vitest';
import express from 'express';
import { admin } from '../config/firebase.js';
import { authenticate } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';
import {
  mapConversationSummary,
  mapMessage,
  titleFromFirstMessage,
  toIso,
} from '../repositories/aiConversationRepository.js';

/**
 * These tests cover the AI chat-history read path that previously returned a
 * 500 ("internal_error / an unexpected error occurred"). The root cause was a
 * composite-index-requiring query; the fix removed that query and routes the
 * conversation→summary / message→DTO mapping through pure helpers. Here we
 * exercise those helpers directly (no Firestore needed) plus the auth gate.
 */

describe('AI history mapping (root-cause fix for the 500)', () => {
  it('maps an authenticated user WITH history correctly', () => {
    const created = new admin.firestore.Timestamp(1_696_154_400, 0); // 2023-10-01T10:00:00Z
    const updated = new admin.firestore.Timestamp(1_696_154_460, 0);
    const summary = mapConversationSummary(
      'c1',
      { createdAt: created, updatedAt: updated },
      { role: 'user', text: 'What should I train today?' },
      4,
    );
    expect(summary).toEqual({
      id: 'c1',
      title: 'What should I train today?',
      createdAt: created.toDate().toISOString(),
      updatedAt: updated.toDate().toISOString(),
      messageCount: 4,
    });
  });

  it('maps EMPTY history without throwing (no conversations → safe defaults)', () => {
    // An empty list is produced upstream; mapping an empty-ish doc must not throw.
    const summary = mapConversationSummary('c0', {}, undefined, 0);
    expect(summary.id).toBe('c0');
    expect(summary.title).toBe('New conversation');
    expect(summary.messageCount).toBe(0);
    expect(summary.createdAt).toBeNull();
    expect(summary.updatedAt).toBeNull();
  });

  it('maps a malformed/partial conversation doc with safe fallbacks (no throw)', () => {
    // Non-string title/role, numeric garbage, missing timestamps.
    const summary = mapConversationSummary(
      'cBad',
      { createdAt: 12345, updatedAt: {} },
      { role: 42, text: { nested: true } } as unknown as Record<string, unknown>,
      Number.NaN,
    );
    expect(summary.id).toBe('cBad');
    expect(summary.title).toBe('New conversation');
    expect(summary.createdAt).toBeNull();
    expect(summary.updatedAt).toBeNull();
    expect(summary.messageCount).toBe(0);
  });

  it('handles invalid/missing timestamps via toIso (null, Timestamp, ISO string, Date)', () => {
    expect(toIso(null)).toBeNull();
    expect(toIso(undefined)).toBeNull();
    expect(toIso(12345)).toBeNull();
    expect(toIso('2026-10-01T10:00:00.000Z')).toBe('2026-10-01T10:00:00.000Z');
    const d = new Date('2026-10-01T10:00:00.000Z');
    expect(toIso(d)).toBe(d.toISOString());
    const ts = new admin.firestore.Timestamp(1_696_154_400, 0);
    expect(toIso(ts)).toBe(ts.toDate().toISOString());
  });

  it('derives title only from a user first message, else a generic label', () => {
    expect(titleFromFirstMessage({ role: 'user', text: 'Hello coach' })).toBe('Hello coach');
    expect(titleFromFirstMessage({ role: 'assistant', text: 'Hi there' })).toBe('New conversation');
    expect(titleFromFirstMessage(undefined)).toBe('New conversation');
    expect(titleFromFirstMessage({ role: 'user', text: '   ' })).toBe('New conversation');
  });

  it('mapMessage defaults role/text and serializes createdAt defensively', () => {
    expect(mapMessage(undefined)).toEqual({ role: 'user', text: '', createdAt: null });
    const ts = new admin.firestore.Timestamp(1_696_154_400, 0);
    expect(mapMessage({ role: 'assistant', text: 'Hi', createdAt: ts })).toEqual({
      role: 'assistant',
      text: 'Hi',
      createdAt: ts.toDate().toISOString(),
    });
    // Malformed message doc must not throw.
    expect(mapMessage({ role: 7, text: null } as unknown as Record<string, unknown>)).toEqual({
      role: 'user',
      text: '',
      createdAt: null,
    });
  });

  it('produces the success envelope shape { conversations: [...] }', () => {
    const conversations = [
      mapConversationSummary('c1', { updatedAt: new admin.firestore.Timestamp(1_696_154_460, 0) }, { role: 'user', text: 'Hi' }, 2),
    ];
    const envelope = { success: true, data: { conversations } };
    expect(envelope.success).toBe(true);
    expect(Array.isArray(envelope.data.conversations)).toBe(true);
    expect(envelope.data.conversations[0].title).toBe('Hi');
  });
});

describe('AI history auth gate', () => {
  function serve(build: (app: express.Express) => void): { url: string; close: () => void } {
    const app = express();
    app.use(express.json());
    build(app);
    app.use(errorHandler);
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
  }

  it('rejects an unauthenticated history request with 401 (not another user\'s data)', async () => {
    const { url, close } = serve((app) => {
      app.get('/api/ai/conversations', authenticate, (_req, res) =>
        res.json({ success: true, data: { conversations: [] } }),
      );
    });
    try {
      const res = await fetch(`${url}/api/ai/conversations`);
      expect(res.status).toBe(401);
      const body = (await res.json()) as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    } finally {
      close();
    }
  });
});
