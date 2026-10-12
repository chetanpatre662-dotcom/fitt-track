import { getFirestore, admin } from '../config/firebase.js';

/**
 * Data access for trainerLinks/{studentUid}: the single source of truth for the
 * trainer <-> student relationship, keyed by the student's uid (one student
 * belongs to at most one trainer).
 *
 * Backend-Admin-SDK-write-only and never client-readable (firestore.rules).
 */
export class TrainerLinkRepository {
  private get col(): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('trainerLinks');
  }

  /** Returns trainerLinks/{studentUid} or null. */
  async get(studentUid: string): Promise<Record<string, unknown> | null> {
    const snap = await this.col.doc(studentUid).get();
    if (!snap.exists) return null;
    return { studentUid: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  /**
   * All active links owned by a trainer, newest first (by updatedAt DESC).
   *
   * Served by the existing trainerLinks (trainerId ASC, status ASC, updatedAt
   * DESC) composite index — NO index change required. An optional `limit`
   * bounds the roster to the newest N active students (a load-more affordance
   * can page with `cursorUpdatedAt`, the ISO updatedAt of the last returned
   * row). When `limit` is omitted the full active roster is returned, so the
   * dashboard's existing live-count behavior is unchanged.
   *
   * The rows are sorted/sliced in memory as a defensive fallback so correctness
   * holds under test doubles whose orderBy/limit/startAfter are passthroughs;
   * against real Firestore the query already returns the ordered page.
   */
  async listByTrainer(
    trainerId: string,
    opts: { limit?: number; cursorUpdatedAt?: string | null } = {},
  ): Promise<Record<string, unknown>[]> {
    const base = this.col.where('trainerId', '==', trainerId).where('status', '==', 'active');
    const cursorMs = parseIsoMs(opts.cursorUpdatedAt);

    let q: FirebaseFirestore.Query = base.orderBy('updatedAt', 'desc');
    if (cursorMs !== null) q = q.startAfter(new Date(cursorMs));
    if (opts.limit && opts.limit > 0) q = q.limit(opts.limit);
    const snap = await q.get();

    let rows: Record<string, unknown>[] = snap.docs.map((d) => ({
      studentUid: d.id,
      ...(d.data() as Record<string, unknown>),
    }));
    rows.sort((a, b) => tsMillis(b.updatedAt) - tsMillis(a.updatedAt));
    if (cursorMs !== null) rows = rows.filter((r) => tsMillis(r.updatedAt) < cursorMs);
    if (opts.limit && opts.limit > 0) rows = rows.slice(0, opts.limit);
    return rows;
  }

  /** All PENDING requests addressed to a trainer, newest first. */
  async listRequestsByTrainer(trainerId: string): Promise<Record<string, unknown>[]> {
    const snap = await this.col
      .where('trainerId', '==', trainerId)
      .where('status', '==', 'pending')
      .get();
    const rows: Record<string, unknown>[] = snap.docs.map((d) => ({
      studentUid: d.id,
      ...(d.data() as Record<string, unknown>),
    }));
    rows.sort((a, b) => tsMillis(b.updatedAt) - tsMillis(a.updatedAt));
    return rows;
  }

  /** Direct document reference (used inside transactions). */
  doc(studentUid: string): FirebaseFirestore.DocumentReference {
    return this.col.doc(studentUid);
  }

  /** Shared FieldValue helpers so callers can build transactional writes. */
  get fieldValue(): typeof admin.firestore.FieldValue {
    return admin.firestore.FieldValue;
  }
}

/** Parses an ISO cursor string to epoch ms, or null when absent/unparseable. */
function parseIsoMs(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function tsMillis(value: unknown): number {
  const t = value as admin.firestore.Timestamp | undefined;
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? 0 : ms;
  }
  return 0;
}

export const trainerLinkRepository = new TrainerLinkRepository();
