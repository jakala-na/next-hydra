import { z } from "zod";

export const apiServerEnvFields = {
  ADMIN_URL: z.string().url(),
  REGISTRATION_APPROVER_EMAIL: z.string().email(),
};

export const apiServerEnvSchema = z.object(apiServerEnvFields);
