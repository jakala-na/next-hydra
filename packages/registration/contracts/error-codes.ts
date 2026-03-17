import { z } from "zod";

export const registrationErrorCodeSchema = z.enum([
  "submit_failed",
  "not_found",
  "conflict",
  "unauthorized",
]);

export const registrationErrorDataSchema = z.object({
  code: registrationErrorCodeSchema,
});

export type RegistrationErrorCode = z.infer<typeof registrationErrorCodeSchema>;
export type RegistrationErrorData = z.infer<typeof registrationErrorDataSchema>;
