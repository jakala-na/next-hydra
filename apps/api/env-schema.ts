import { z } from "zod";

export const apiServerEnvFields = {
  REGISTRATION_APPROVER_EMAIL: z.string().email(),
};

export const apiServerEnvSchema = z.object(apiServerEnvFields);
