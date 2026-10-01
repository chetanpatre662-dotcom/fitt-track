import { admin } from '../config/firebase.js';
import { profileRepository } from '../repositories/profileRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { NotFoundError } from '../utils/errors.js';
import { ageFromDob, estimateTargets } from '../utils/fitnessCalc.js';
import type { ProfileUpsertInput } from '../validators/profileValidators.js';

export class ProfileService {
  async get(uid: string): Promise<Record<string, unknown>> {
    const profile = await profileRepository.get(uid);
    if (!profile) throw new NotFoundError('Profile not found. Complete onboarding first.');
    return profile;
  }

  /**
   * Upserts a profile. If the client did not provide custom targets, the
   * backend computes estimates from the profile + primary goal. Also flips the
   * account's onboardingCompleted flag to true.
   */
  async upsert(uid: string, input: ProfileUpsertInput): Promise<Record<string, unknown>> {
    const age = ageFromDob(input.dateOfBirth);
    const primaryGoal = input.goals[0];

    const targets =
      input.targets && input.targets.isCustom
        ? input.targets
        : estimateTargets({
            weightKg: input.weightKg,
            heightCm: input.heightCm,
            ageYears: age,
            gender: input.gender,
            activity: input.activityLevel,
            goal: primaryGoal,
          });

    const data: Record<string, unknown> = {
      ...input,
      // Persist DOB as a Firestore Timestamp for consistent querying.
      dateOfBirth: admin.firestore.Timestamp.fromDate(new Date(input.dateOfBirth)),
      ageYears: age,
      targets,
    };

    const saved = await profileRepository.upsert(uid, data);

    // Mark onboarding complete + mirror units on the account doc.
    await userRepository.doc(uid).set(
      {
        onboardingCompleted: true,
        units: input.units,
        displayName: input.name,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return saved;
  }
}

export const profileService = new ProfileService();
