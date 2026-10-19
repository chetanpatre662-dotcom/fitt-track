"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trainerService = exports.TrainerService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const trainerRepository_js_1 = require("../repositories/trainerRepository.js");
const trainerLinkRepository_js_1 = require("../repositories/trainerLinkRepository.js");
const profileRepository_js_1 = require("../repositories/profileRepository.js");
const workoutRepository_js_1 = require("../repositories/workoutRepository.js");
const nutritionService_js_1 = require("./nutritionService.js");
const waterService_js_1 = require("./waterService.js");
const progressService_js_1 = require("./progressService.js");
const measurementService_js_1 = require("./measurementService.js");
const personalRecordService_js_1 = require("./personalRecordService.js");
const progressPhotoService_js_1 = require("./progressPhotoService.js");
const roleService_js_1 = require("./roleService.js");
const role_js_1 = require("../middleware/role.js");
const errors_js_1 = require("../utils/errors.js");
const referralCode_js_1 = require("../utils/referralCode.js");
const trainerValidators_js_1 = require("../validators/trainerValidators.js");
/** Max generated-code candidate attempts before giving up (collisions). */
const MAX_CODE_ATTEMPTS = 5;
/**
 * Trainer-side business logic: student linking, trainer profile/dashboard, and
 * per-student data views. Per-student views reuse the existing per-feature
 * services by passing the student's uid as the uid — authorization is enforced
 * by the caller (assertTrainerOwnsStudent) BEFORE any student data is read.
 */
class TrainerService {
    /**
     * Links the authenticated student to the trainer that owns `referralCode`.
     * - Unknown code -> soft success {linked:false, reason:'invalid_code'} (no
     *   link, so a typo never errors out registration).
     * - Trainer accounts cannot be linked as a student -> 409.
     * - Valid code -> transactionally create trainerLinks/{studentUid}, mirror
     *   profile.trainerId, and increment the trainer's totalStudents EXACTLY
     *   once (idempotent: a re-link to the same trainer does not double count).
     */
    async linkStudent(studentUid, referralCode, opts) {
        const codeLower = (0, referralCode_js_1.normalize)(referralCode);
        // Resolve the code via the index doc so we can honor `active`.
        const codeDoc = await trainerRepository_js_1.trainerRepository.getByReferralCodeDoc(codeLower);
        if (!codeDoc || !codeDoc.active) {
            return { linked: false, reason: 'invalid_code' };
        }
        const trainerId = codeDoc.trainerId;
        // Verify the resolved account is actually an active trainer; never link to
        // a non-trainer. "unknown code" and "not a trainer" are indistinguishable
        // to the caller (both invalid_code) so no internal state leaks.
        const trainer = await trainerRepository_js_1.trainerRepository.get(trainerId);
        const resolvedRole = await roleService_js_1.roleService.resolveRole(trainerId);
        if (resolvedRole !== 'trainer' || !trainer || trainer.status !== 'active') {
            return { linked: false, reason: 'invalid_code' };
        }
        // A trainer account can never be linked as a student.
        const callerRole = await roleService_js_1.roleService.resolveRole(studentUid);
        if (callerRole === 'trainer') {
            throw new errors_js_1.ConflictError('Trainer accounts cannot be linked to another trainer.');
        }
        const trainerName = trainer.name ?? undefined;
        // Inspect any existing active link to apply the one-active-trainer guard.
        const existingLink = await trainerLinkRepository_js_1.trainerLinkRepository.get(studentUid);
        const hasActiveLink = existingLink?.status === 'active';
        const currentTrainerId = existingLink?.trainerId;
        if (hasActiveLink && currentTrainerId === trainerId) {
            return { linked: true, trainerId, trainerName, alreadyLinked: true };
        }
        if (hasActiveLink && currentTrainerId && currentTrainerId !== trainerId) {
            if (opts?.confirmSwitch !== true) {
                const currentTrainer = await trainerRepository_js_1.trainerRepository.get(currentTrainerId);
                return {
                    linked: false,
                    reason: 'already_linked',
                    currentTrainer: {
                        trainerId: currentTrainerId,
                        name: currentTrainer?.name ?? null,
                    },
                    requestedTrainer: { trainerId, name: trainerName ?? null },
                };
            }
            await this.switchStudentTrainer(studentUid, trainerId);
            return { linked: true, switched: true, trainerId, trainerName };
        }
        // No active link -> create it (the existing create path: inline tx.set +
        // profile mirror + a single +1 counter increment).
        await this.createStudentLink(studentUid, trainerId);
        return { linked: true, trainerId, trainerName };
    }
    /** Create-path link transaction (first link / re-activate): +1 counter. */
    async createStudentLink(studentUid, trainerId) {
        const db = (0, firebase_js_1.getFirestore)();
        const linkRef = trainerLinkRepository_js_1.trainerLinkRepository.doc(studentUid);
        const trainerRef = db.collection('trainers').doc(trainerId);
        const profileRef = db.collection('users').doc(studentUid).collection('profile').doc('data');
        await db.runTransaction(async (tx) => {
            const linkSnap = await tx.get(linkRef);
            const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
            const existing = linkSnap.exists ? linkSnap.data() : undefined;
            const alreadyActiveSameTrainer = existing?.trainerId === trainerId && existing?.status === 'active';
            tx.set(linkRef, {
                studentUid,
                trainerId,
                status: 'active',
                ...(linkSnap.exists ? {} : { createdAt: now }),
                updatedAt: now,
            }, { merge: true });
            tx.set(profileRef, { trainerId, updatedAt: now }, { merge: true });
            if (!alreadyActiveSameTrainer) {
                tx.set(trainerRef, {
                    totalStudents: firebase_js_1.admin.firestore.FieldValue.increment(1),
                    updatedAt: now,
                }, { merge: true });
            }
        });
    }
    /**
     * Confirmed switch: move the existing link to the new trainer. Updates ONLY
     * the link row (trainerId + updatedAt) and re-mirrors profile.trainerId. It
     * deliberately writes NO stored counter — the dashboard derives counts from
     * the live countActiveStudents query, so both trainers' counts are
     * automatically correct after the move and no decrement can drift negative.
     */
    async switchStudentTrainer(studentUid, trainerId) {
        const db = (0, firebase_js_1.getFirestore)();
        const linkRef = trainerLinkRepository_js_1.trainerLinkRepository.doc(studentUid);
        const profileRef = db.collection('users').doc(studentUid).collection('profile').doc('data');
        await db.runTransaction(async (tx) => {
            await tx.get(linkRef);
            const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
            tx.set(linkRef, { trainerId, status: 'active', updatedAt: now }, { merge: true });
            tx.set(profileRef, { trainerId, updatedAt: now }, { merge: true });
        });
    }
    /**
     * Creates a PENDING connect request from `studentUid` to the trainer that
     * owns `referralCode`. Validation mirrors `linkStudent` exactly:
     * - Unknown / inactive / non-trainer code -> soft {ok:false,
     *   reason:'invalid_code'} (no write, so a typo never errors out
     *   registration).
     * - A trainer account can never request a trainer -> 409.
     * Then, instead of immediately linking:
     * - An existing link to the SAME trainer that is already pending or active ->
     *   idempotent soft success {ok:true, status:<existing>} with NO write.
     * - An ACTIVE link to a DIFFERENT trainer -> {ok:false,
     *   reason:'already_linked', currentTrainer, requestedTrainer} (a switch is a
     *   new explicit request, never a silent auto-switch).
     * - Otherwise write trainerLinks/{studentUid} status:'pending' (NO
     *   profile.trainerId mirror and NO totalStudents increment — access and
     *   counting happen only on approval).
     */
    async requestTrainer(studentUid, referralCode) {
        const codeLower = (0, referralCode_js_1.normalize)(referralCode);
        const codeDoc = await trainerRepository_js_1.trainerRepository.getByReferralCodeDoc(codeLower);
        if (!codeDoc || !codeDoc.active) {
            return { ok: false, reason: 'invalid_code' };
        }
        const trainerId = codeDoc.trainerId;
        const trainer = await trainerRepository_js_1.trainerRepository.get(trainerId);
        const resolvedRole = await roleService_js_1.roleService.resolveRole(trainerId);
        if (resolvedRole !== 'trainer' || !trainer || trainer.status !== 'active') {
            return { ok: false, reason: 'invalid_code' };
        }
        const callerRole = await roleService_js_1.roleService.resolveRole(studentUid);
        if (callerRole === 'trainer') {
            throw new errors_js_1.ConflictError('Trainer accounts cannot be linked to another trainer.');
        }
        const trainerName = trainer.name ?? undefined;
        const existingLink = await trainerLinkRepository_js_1.trainerLinkRepository.get(studentUid);
        const existingStatus = existingLink?.status;
        const existingTrainerId = existingLink?.trainerId;
        // Idempotent: already pending or active with the SAME trainer -> no write.
        if (existingTrainerId === trainerId &&
            (existingStatus === 'pending' || existingStatus === 'active')) {
            return {
                ok: true,
                status: existingStatus,
                trainerId,
                trainerName,
            };
        }
        // An ACTIVE link to a different trainer: never silently overwrite.
        if (existingStatus === 'active' && existingTrainerId && existingTrainerId !== trainerId) {
            const currentTrainer = await trainerRepository_js_1.trainerRepository.get(existingTrainerId);
            return {
                ok: false,
                reason: 'already_linked',
                currentTrainer: {
                    trainerId: existingTrainerId,
                    name: currentTrainer?.name ?? null,
                },
                requestedTrainer: { trainerId, name: trainerName ?? null },
            };
        }
        // No active/pending link to this trainer -> create a pending request. This
        // also (re)claims a prior pending/rejected/inactive link to a different
        // trainer by moving it to pending on the new trainer.
        await this.createPendingRequest(studentUid, trainerId);
        return { ok: true, status: 'pending', trainerId, trainerName };
    }
    /** Write (or re-point) the single link doc to a PENDING request. */
    async createPendingRequest(studentUid, trainerId) {
        const db = (0, firebase_js_1.getFirestore)();
        const linkRef = trainerLinkRepository_js_1.trainerLinkRepository.doc(studentUid);
        await db.runTransaction(async (tx) => {
            const linkSnap = await tx.get(linkRef);
            const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
            tx.set(linkRef, {
                studentUid,
                trainerId,
                status: 'pending',
                ...(linkSnap.exists ? {} : { createdAt: now }),
                updatedAt: now,
            }, { merge: true });
        });
    }
    /**
     * Approves a pending request: requires the pending-aware ownership check,
     * then in one transaction (same shape as createStudentLink) sets
     * status:'active', mirrors users/{studentUid}/profile/data.trainerId AND
     * trainerStatus:'approved', and increments totalStudents EXACTLY once
     * (guarded on the pre-transaction status so a double-approve cannot
     * double-count).
     */
    async approveRequest(trainerId, studentUid) {
        await (0, role_js_1.assertTrainerOwnsPendingRequest)(trainerId, studentUid);
        const db = (0, firebase_js_1.getFirestore)();
        const linkRef = trainerLinkRepository_js_1.trainerLinkRepository.doc(studentUid);
        const trainerRef = db.collection('trainers').doc(trainerId);
        const profileRef = db.collection('users').doc(studentUid).collection('profile').doc('data');
        await db.runTransaction(async (tx) => {
            const linkSnap = await tx.get(linkRef);
            const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
            const wasActive = linkSnap.exists && linkSnap.data()?.status === 'active';
            tx.set(linkRef, { trainerId, status: 'active', updatedAt: now }, { merge: true });
            tx.set(profileRef, { trainerId, trainerStatus: 'approved', updatedAt: now }, { merge: true });
            if (!wasActive) {
                tx.set(trainerRef, { totalStudents: firebase_js_1.admin.firestore.FieldValue.increment(1), updatedAt: now }, { merge: true });
            }
        });
        return { ok: true, status: 'active', studentUid, trainerId };
    }
    /**
     * Rejects a pending request: requires pending ownership, sets
     * status:'rejected'. No profile mirror and no counter change.
     */
    async rejectRequest(trainerId, studentUid) {
        await (0, role_js_1.assertTrainerOwnsPendingRequest)(trainerId, studentUid);
        const db = (0, firebase_js_1.getFirestore)();
        const linkRef = trainerLinkRepository_js_1.trainerLinkRepository.doc(studentUid);
        await db.runTransaction(async (tx) => {
            await tx.get(linkRef);
            const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
            tx.set(linkRef, { status: 'rejected', updatedAt: now }, { merge: true });
        });
        return { ok: true, status: 'rejected', studentUid, trainerId };
    }
    /**
     * Removes a student from the trainer (§5): verifies the ACTIVE
     * trainer-student relationship (404 anti-enumeration) then runs ONE
     * transaction that flips trainerLinks/{studentUid}.status to the existing
     * terminal 'inactive' value and clears the profile mirror
     * (users/{studentUid}/profile/data.trainerId = null, trainerStatus cleared).
     *
     * Deliberately NON-destructive:
     * - writes NO stored counter (the dashboard derives the count live via
     *   countActiveStudents, mirroring switchStudentTrainer, so the count
     *   self-corrects and cannot drift negative);
     * - touches NO other users/{studentUid}/** data and NEVER deletes the
     *   student's Firebase account — the student keeps full use of their account.
     *
     * Revocation is immediate and automatic: assertTrainerOwnsStudent requires
     * status === 'active', so once the link is 'inactive' every per-student read
     * 404s. The guarded flip is idempotent (a double-remove 404s on the second
     * call because the link is no longer active).
     */
    async removeStudent(trainerId, studentUid) {
        await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
        const db = (0, firebase_js_1.getFirestore)();
        const linkRef = trainerLinkRepository_js_1.trainerLinkRepository.doc(studentUid);
        const profileRef = db.collection('users').doc(studentUid).collection('profile').doc('data');
        await db.runTransaction(async (tx) => {
            await tx.get(linkRef);
            const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
            tx.set(linkRef, { status: 'inactive', updatedAt: now }, { merge: true });
            tx.set(profileRef, { trainerId: null, trainerStatus: null, updatedAt: now }, { merge: true });
        });
        return { ok: true, studentUid, status: 'inactive' };
    }
    /**
     * Batch-approves pending requests (§6). Dedupes the uids FIRST (so the
     * caller-applied .max(50) bound and all summary counts are over the unique
     * set), then for EACH unique id runs the existing single-item approveRequest
     * path — which calls assertTrainerOwnsPendingRequest (404 per item) and the
     * idempotent approve transaction. A non-owned / non-pending id is reported as
     * { ok:false, reason:'not_found' } without failing the whole batch.
     */
    async batchApproveRequests(trainerId, studentUids) {
        return this.runBatch(trainerId, studentUids, 'approved', (uid) => this.approveRequest(trainerId, uid));
    }
    /** Batch-rejects pending requests (§6); same contract as batchApproveRequests. */
    async batchRejectRequests(trainerId, studentUids) {
        return this.runBatch(trainerId, studentUids, 'rejected', (uid) => this.rejectRequest(trainerId, uid));
    }
    /**
     * Shared batch driver: dedupe ids, process each unique id SEQUENTIALLY via
     * the single-item path, translate a per-item 404 into a soft failure, and
     * build the { results, summary } envelope. A non-404 error (an unexpected
     * server fault) still propagates so the batch does not silently swallow it.
     */
    async runBatch(_trainerId, studentUids, successKey, act) {
        const uniqueUids = [...new Set(studentUids)];
        const results = [];
        let succeeded = 0;
        let failed = 0;
        for (const studentUid of uniqueUids) {
            try {
                const res = await act(studentUid);
                results.push({ studentUid, ok: true, status: res.status });
                succeeded += 1;
            }
            catch (err) {
                if (err.statusCode === 404) {
                    results.push({ studentUid, ok: false, reason: 'not_found' });
                    failed += 1;
                }
                else {
                    throw err;
                }
            }
        }
        return { results, summary: { [successKey]: succeeded, failed } };
    }
    /**
     * Pending requests for a trainer's "Requests" tab, enriched with the
     * student's name + photoUrl (slimmer than listStudents — identity only).
     */
    async listRequestsForTrainer(trainerId) {
        const requests = await trainerLinkRepository_js_1.trainerLinkRepository.listRequestsByTrainer(trainerId);
        return Promise.all(requests.map(async (link) => {
            const studentUid = link.studentUid;
            const profile = await profileRepository_js_1.profileRepository.get(studentUid);
            return {
                studentUid,
                name: profile?.name ?? null,
                photoUrl: profile?.photoUrl ?? null,
                requestedAt: toIso(link.updatedAt) ?? toIso(link.createdAt),
            };
        }));
    }
    /**
     * Idempotently promotes `uid` to a trainer: sets users/{uid}.role='trainer'
     * and upserts trainers/{uid}, then generates+claims a unique code only if the
     * trainer has none yet. Re-running never creates a duplicate trainer or a
     * second code.
     */
    async ensureTrainerAccount(uid, details) {
        const db = (0, firebase_js_1.getFirestore)();
        const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
        await db
            .collection('users')
            .doc(uid)
            .set({ role: 'trainer', updatedAt: now }, { merge: true });
        const existing = await trainerRepository_js_1.trainerRepository.get(uid);
        const base = {
            trainerId: uid,
            userId: uid,
            status: 'active',
            active: true,
            updatedAt: now,
        };
        if (details.name)
            base.name = details.name;
        if (!existing) {
            base.photoUrl = details.photoUrl ?? null;
            base.totalStudents = 0;
            base.createdAt = now;
        }
        await trainerRepository_js_1.trainerRepository.upsert(uid, base);
        // Generate a code only if this trainer does not already have one.
        const current = existing?.referralCode ?? null;
        if (current) {
            return { trainerId: uid, referralCode: current };
        }
        const code = await this.generateReferralCode(uid);
        return { trainerId: uid, referralCode: code };
    }
    /** Returns the trainer's current referral code info. */
    async getReferralCode(trainerId) {
        const trainer = await trainerRepository_js_1.trainerRepository.get(trainerId);
        return {
            code: trainer?.referralCode ?? null,
            active: trainer?.status === 'active',
            referralCodeUpdatedAt: toIso(trainer?.referralCodeUpdatedAt),
        };
    }
    /**
     * Generates a NEW unique code (regenerate). Outer candidate loop (<=N); each
     * attempt is one all-reads-before-writes transaction that claims the new
     * code, deactivates the old one, and updates the trainer atomically. A
     * collision aborts the attempt with zero writes and a fresh candidate is
     * tried. 503 only if every attempt collides.
     */
    async generateReferralCode(trainerId, rng) {
        const trainer = await trainerRepository_js_1.trainerRepository.get(trainerId);
        const oldCodeLower = trainer?.referralCodeLower ?? null;
        for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
            const candidate = (0, referralCode_js_1.generateCandidate)(rng);
            const codeLower = (0, referralCode_js_1.normalize)(candidate);
            // Skip the (astronomically unlikely) case where we regenerate our own code.
            if (codeLower === oldCodeLower)
                continue;
            const claimed = await this.runClaimTransaction(trainerId, candidate, codeLower, oldCodeLower);
            if (claimed)
                return candidate;
        }
        throw new errors_js_1.ServiceUnavailableError('Could not generate a unique referral code, please retry.');
    }
    /**
     * Sets a trainer-chosen custom code. Validates format + reserved words, then
     * runs the claim transaction ONCE (no retry): a collision with another
     * trainer is a terminal 409.
     */
    async setCustomReferralCode(trainerId, desiredCode) {
        const parsed = trainerValidators_js_1.referralCodeSchema.safeParse({ code: desiredCode });
        if (!parsed.success) {
            throw new errors_js_1.BadRequestError('Invalid referral code.', parsed.error.flatten());
        }
        const displayCode = parsed.data.code;
        const codeLower = (0, referralCode_js_1.normalize)(displayCode);
        const trainer = await trainerRepository_js_1.trainerRepository.get(trainerId);
        const oldCodeLower = trainer?.referralCodeLower ?? null;
        const claimed = await this.runClaimTransaction(trainerId, displayCode, codeLower, oldCodeLower);
        if (!claimed) {
            throw new errors_js_1.ConflictError('That referral code is taken.');
        }
        return displayCode;
    }
    /**
     * Read-only availability check for a desired custom code. Validates format +
     * reserved words first, then applies the shared claimability predicate.
     */
    async checkAvailability(desiredCode, trainerId) {
        const parsed = trainerValidators_js_1.availabilityQuerySchema.safeParse({ code: desiredCode });
        if (!parsed.success) {
            const flat = parsed.error.flatten();
            const reserved = flat.fieldErrors.code?.some((m) => m.includes('reserved'));
            return { available: false, reason: reserved ? 'reserved' : 'invalid' };
        }
        const codeLower = (0, referralCode_js_1.normalize)(parsed.data.code);
        const doc = await trainerRepository_js_1.trainerRepository.getByReferralCodeDoc(codeLower);
        // Claimable iff doc missing OR already owned by this trainer; unavailable
        // iff owned by a different trainer (regardless of `active`).
        if (!doc || doc.trainerId === trainerId) {
            return { available: true };
        }
        return { available: false, reason: 'taken' };
    }
    /**
     * One all-reads-before-writes transaction: read the new-code doc (+ old-code
     * doc), apply the shared claimability predicate, and on success claim the new
     * code + deactivate the old + update the trainer — atomically. Returns false
     * (no writes) when the code is owned by another trainer.
     */
    async runClaimTransaction(trainerId, displayCode, codeLower, oldCodeLower) {
        const db = (0, firebase_js_1.getFirestore)();
        const newRef = trainerRepository_js_1.trainerRepository.referralCodeDoc(codeLower);
        const oldRef = oldCodeLower && oldCodeLower !== codeLower
            ? trainerRepository_js_1.trainerRepository.referralCodeDoc(oldCodeLower)
            : null;
        return db.runTransaction(async (tx) => {
            // READS FIRST.
            const newSnap = await tx.get(newRef);
            if (oldRef)
                await tx.get(oldRef);
            const existing = newSnap.exists
                ? {
                    trainerId: newSnap.data()?.trainerId ?? '',
                    active: newSnap.data()?.active,
                }
                : null;
            // DECIDE + WRITE (claim is a no-op write guard when taken by another).
            const ok = trainerRepository_js_1.trainerRepository.claimReferralCode(tx, codeLower, displayCode, trainerId, existing);
            if (!ok)
                return false;
            if (oldRef)
                trainerRepository_js_1.trainerRepository.deactivateReferralCode(tx, oldCodeLower);
            trainerRepository_js_1.trainerRepository.setActiveReferralCodeOnTrainer(tx, trainerId, displayCode, codeLower);
            return true;
        });
    }
    /** Trainer profile with an authoritative live active-student count. */
    async getProfile(trainerId) {
        const trainer = (await trainerRepository_js_1.trainerRepository.get(trainerId)) ?? { trainerId };
        const activeStudents = await trainerRepository_js_1.trainerRepository.countActiveStudents(trainerId);
        return { ...trainer, totalStudents: activeStudents };
    }
    /** Per-student summary cards for the dashboard student list. */
    async listStudents(trainerId) {
        const links = await trainerLinkRepository_js_1.trainerLinkRepository.listByTrainer(trainerId);
        const today = todayKey();
        const summaries = await Promise.all(links.map(async (link) => {
            const studentUid = link.studentUid;
            const [profile, latestWorkouts, nutrition, water] = await Promise.all([
                profileRepository_js_1.profileRepository.get(studentUid),
                workoutRepository_js_1.workoutRepository.list(studentUid, { status: 'completed', limit: 1 }),
                nutritionService_js_1.nutritionService.getDay(studentUid, today),
                waterService_js_1.waterService.getDay(studentUid, today),
            ]);
            const lastWorkout = latestWorkouts[0] ?? null;
            return {
                studentUid,
                name: profile?.name ?? null,
                photoUrl: profile?.photoUrl ?? null,
                goal: profile?.goals?.[0] ?? null,
                currentWeightKg: profile?.weightKg ?? null,
                lastWorkout: lastWorkout
                    ? {
                        id: lastWorkout.id,
                        name: lastWorkout.name,
                        startedAt: toIso(lastWorkout.startedAt),
                        totalVolume: lastWorkout.totalVolume ?? 0,
                    }
                    : null,
                todayActivity: {
                    caloriesConsumed: nutrition.totals?.calories ?? 0,
                    waterMl: water.totalMl ?? 0,
                    hasActivityToday: (nutrition.entries?.length ?? 0) > 0 || (water.totalMl ?? 0) > 0,
                },
                linkedAt: toIso(link.createdAt),
            };
        }));
        return summaries;
    }
    // --- Per-student detail views (authorization asserted by caller first) ---
    async studentOverview(studentUid) {
        const [profile, link] = await Promise.all([
            profileRepository_js_1.profileRepository.get(studentUid),
            trainerLinkRepository_js_1.trainerLinkRepository.get(studentUid),
        ]);
        return {
            studentUid,
            profile: profile ?? null,
            trainerAssociation: link
                ? { trainerId: link.trainerId, status: link.status, linkedAt: toIso(link.createdAt) }
                : null,
        };
    }
    /**
     * Resolves whether the student currently shares `category` with their
     * trainer. Precedence:
     *   1. profile.trainerSharing[category] when it is an explicit boolean;
     *   2. otherwise, for the legacy `progressPhotos` category only, fall back to
     *      the old boolean profile.shareProgressWithTrainer === true;
     *   3. otherwise (map absent, non-photos category) default to false.
     * This preserves prior consent: a student who had the single legacy toggle ON
     * still shares progress photos until they set the granular map.
     */
    isShared(profile, category) {
        const map = profile?.trainerSharing;
        const value = map?.[category];
        if (typeof value === 'boolean')
            return value;
        if (category === 'progressPhotos')
            return profile?.shareProgressWithTrainer === true;
        return false;
    }
    /**
     * The student's completed workouts for a given day. Gated by the
     * `workoutHistory` category; returns {shared, workouts} so the caller can
     * distinguish "nothing today" from "not shared".
     */
    async studentWorkoutsForDate(studentUid, dateKey) {
        const profile = await profileRepository_js_1.profileRepository.get(studentUid);
        if (!this.isShared(profile, 'workoutHistory'))
            return { shared: false, workouts: [] };
        const all = await workoutRepository_js_1.workoutRepository.list(studentUid, { status: 'completed' });
        return { shared: true, workouts: all.filter((w) => toDateKey(w.startedAt) === dateKey) };
    }
    /**
     * One newest-first page of the student's completed-workout history, gated by
     * the `workoutHistory` category. Uses the cursor-paginated
     * `progressService.historyPage` (startedAt-DESC, existing composite index) so
     * large histories are bounded; the response carries `nextCursor` for a
     * load-more affordance (null when there are no more pages). `shared:false`
     * returns an empty page with a null cursor.
     */
    async studentWorkoutHistory(studentUid, opts = {}) {
        const profile = await profileRepository_js_1.profileRepository.get(studentUid);
        if (!this.isShared(profile, 'workoutHistory')) {
            return { shared: false, history: [], nextCursor: null };
        }
        const { items, nextCursor } = await progressService_js_1.progressService.historyPage(studentUid, {
            limit: opts.limit,
            cursorStartedAt: opts.cursor,
        });
        return { shared: true, history: items, nextCursor };
    }
    /**
     * The full embedded detail of a single stored workout, gated by the SAME
     * `workoutHistory` category used by the today/history reads (so a hidden
     * history can never leak one workout here). Ownership is asserted by the
     * caller first. Returns {shared:false, workout:null} when sharing is off, and
     * {shared:true, workout:null} when the doc does not exist (anti-enumeration
     * parity with the ownership 404 the controller raises).
     *
     * The projection returns every recorded set exactly as stored (including the
     * cardio fields distanceM/durationSeconds/calories) and the stored session
     * aggregates AS-IS — they are never recomputed from sets[]. A stored
     * aggregate is omitted only when it is absent or non-numeric on the doc.
     */
    async studentWorkoutDetail(studentUid, workoutId) {
        // Belt-and-suspenders: the literal /workouts/history and /workouts/assign
        // routes are registered before this param route, but never treat those
        // reserved segments as a workout id even if they ever reach here.
        if (workoutId === 'history' || workoutId === 'assign') {
            return { shared: true, workout: null };
        }
        const profile = await profileRepository_js_1.profileRepository.get(studentUid);
        if (!this.isShared(profile, 'workoutHistory'))
            return { shared: false, workout: null };
        const doc = await workoutRepository_js_1.workoutRepository.get(studentUid, workoutId);
        if (!doc)
            return { shared: true, workout: null };
        return { shared: true, workout: projectWorkoutDetail(doc) };
    }
    async studentNutrition(studentUid, dateKey) {
        const profile = await profileRepository_js_1.profileRepository.get(studentUid);
        if (!this.isShared(profile, 'nutrition')) {
            return { shared: false, dateKey, entries: [], totals: null };
        }
        const body = await nutritionService_js_1.nutritionService.getDay(studentUid, dateKey);
        return { shared: true, ...body };
    }
    async studentWater(studentUid, dateKey) {
        const profile = await profileRepository_js_1.profileRepository.get(studentUid);
        if (!this.isShared(profile, 'nutrition')) {
            return { shared: false, dateKey, totalMl: 0, entries: [] };
        }
        const body = await waterService_js_1.waterService.getDay(studentUid, dateKey);
        return { shared: true, ...body };
    }
    async studentProgress(studentUid, range = '90d') {
        const profile = await profileRepository_js_1.profileRepository.get(studentUid);
        if (!this.isShared(profile, 'progressReports'))
            return { shared: false, progress: null };
        return { shared: true, progress: await progressService_js_1.progressService.workoutSummary(studentUid, range) };
    }
    /** The student's body-measurement / weight history (newest first). */
    async studentMeasurements(studentUid) {
        const profile = await profileRepository_js_1.profileRepository.get(studentUid);
        if (!this.isShared(profile, 'measurements'))
            return { shared: false, measurements: [] };
        return { shared: true, measurements: await measurementService_js_1.measurementService.list(studentUid) };
    }
    /** Per-exercise progression series for the student. */
    async studentExerciseProgression(studentUid, exerciseId, range = '90d') {
        const profile = await profileRepository_js_1.profileRepository.get(studentUid);
        if (!this.isShared(profile, 'progressReports'))
            return { shared: false, progression: null };
        return {
            shared: true,
            progression: await progressService_js_1.progressService.exerciseProgression(studentUid, exerciseId, range),
        };
    }
    /** The student's personal records (newest first). */
    async studentRecords(studentUid) {
        const profile = await profileRepository_js_1.profileRepository.get(studentUid);
        if (!this.isShared(profile, 'progressReports'))
            return { shared: false, personalRecords: [] };
        return { shared: true, personalRecords: await personalRecordService_js_1.personalRecordService.listAll(studentUid) };
    }
    /**
     * Progress photos, gated by the student's progressPhotos sharing category
     * (which falls back to the legacy shareProgressWithTrainer flag). When
     * sharing is off, returns an empty list. Photos are returned with short-lived
     * signed URLs (never public).
     */
    async studentPhotos(studentUid) {
        const profile = await profileRepository_js_1.profileRepository.get(studentUid);
        if (!this.isShared(profile, 'progressPhotos'))
            return { shared: false, photos: [] };
        const photos = await progressPhotoService_js_1.progressPhotoService.listWithSignedUrls(studentUid);
        return { shared: true, photos };
    }
    /** Convenience: assert ownership then run a loader. */
    async forOwnedStudent(trainerId, studentUid, loader) {
        await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
        return loader();
    }
}
exports.TrainerService = TrainerService;
/**
 * Projects a stored workout doc (users/{uid}/workouts/{id}) into the
 * trainer-facing detail contract (design section (d)). Session aggregates are
 * copied straight from the doc — never recomputed — and are omitted when
 * absent/non-numeric. Every set is returned exactly as stored, including the
 * cardio fields. An exercise with no sets is returned with an empty sets[].
 */
function projectWorkoutDetail(doc) {
    const rawExercises = Array.isArray(doc.exercises) ? doc.exercises : [];
    const exercises = rawExercises.map((ex) => projectExerciseDetail(ex));
    const workout = {
        id: doc.id ?? '',
        name: doc.name ?? 'Workout',
        type: doc.type ?? null,
        status: doc.status ?? 'unknown',
        muscleGroups: Array.isArray(doc.muscleGroups) ? doc.muscleGroups : [],
        startedAt: toIso(doc.startedAt),
        endedAt: toIso(doc.endedAt),
        exercises,
    };
    // Stored session aggregates, returned AS-IS and only when numeric.
    for (const key of ['durationSeconds', 'totalVolume', 'completedSets', 'totalReps']) {
        const value = doc[key];
        if (typeof value === 'number' && Number.isFinite(value))
            workout[key] = value;
    }
    return workout;
}
/** Projects one stored exercise, passing every set through unchanged. */
function projectExerciseDetail(ex) {
    const rawSets = Array.isArray(ex.sets) ? ex.sets : [];
    return {
        exerciseId: ex.exerciseId ?? '',
        name: ex.name ?? null,
        order: typeof ex.order === 'number' ? ex.order : 0,
        notes: ex.notes ?? null,
        sets: rawSets.map((set) => projectSetDetail(set)),
    };
}
/**
 * Projects one stored set exactly as recorded. Numeric fields are passed
 * through when present (and finite), else null; nothing is synthesized.
 */
function projectSetDetail(set) {
    const num = (v) => typeof v === 'number' && Number.isFinite(v) ? v : null;
    const rawStages = Array.isArray(set.dropStages) ? set.dropStages : [];
    return {
        setNumber: typeof set.setNumber === 'number' ? set.setNumber : 0,
        weightKg: num(set.weightKg),
        reps: num(set.reps),
        distanceM: num(set.distanceM),
        durationSeconds: num(set.durationSeconds),
        calories: num(set.calories),
        completed: set.completed === true,
        setType: set.setType === 'drop' ? 'drop' : 'normal',
        dropStages: rawStages.map((stage) => {
            const st = stage;
            return { weightKg: num(st.weightKg), reps: num(st.reps) };
        }),
    };
}
function todayKey() {
    return toDateKeyFromDate(new Date());
}
function toDateKeyFromDate(d) {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function toDateKey(value) {
    const t = value;
    if (t && typeof t.toDate === 'function')
        return toDateKeyFromDate(t.toDate());
    return null;
}
function toIso(value) {
    const t = value;
    if (t && typeof t.toDate === 'function')
        return t.toDate().toISOString();
    if (typeof value === 'string')
        return value;
    return null;
}
exports.trainerService = new TrainerService();
//# sourceMappingURL=trainerService.js.map