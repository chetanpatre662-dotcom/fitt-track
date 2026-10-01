import { z } from 'zod';

export const fcmTokenSchema = z.object({
  token: z.string().min(1).max(4096),
});

export type FcmTokenInput = z.infer<typeof fcmTokenSchema>;
