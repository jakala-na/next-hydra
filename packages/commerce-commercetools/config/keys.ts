import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const includesScope = (scope: string, name: string): boolean =>
  scope.split(/\s+/u).some((entry) => entry.startsWith(`${name}:`));

const paymentManagementScope = z
  .string()
  .min(1)
  .refine(
    (scope) =>
      includesScope(scope, "manage_payments") ||
      includesScope(scope, "manage_project"),
    "must include manage_payments or manage_project"
  );

export const serverKeys = () =>
  createEnv({
    runtimeEnv: {
      COMMERCETOOLS_CLIENT_ID: process.env.COMMERCETOOLS_CLIENT_ID,
      COMMERCETOOLS_CLIENT_SECRET: process.env.COMMERCETOOLS_CLIENT_SECRET,
      COMMERCETOOLS_PROJECT_KEY: process.env.COMMERCETOOLS_PROJECT_KEY,
      COMMERCETOOLS_REGION: process.env.COMMERCETOOLS_REGION,
      COMMERCETOOLS_SCOPE: process.env.COMMERCETOOLS_SCOPE,
    },
    server: {
      COMMERCETOOLS_CLIENT_ID: z.string().min(1),
      COMMERCETOOLS_CLIENT_SECRET: z.string().min(1),
      COMMERCETOOLS_PROJECT_KEY: z.string().min(1),
      COMMERCETOOLS_REGION: z.string().min(1),
      COMMERCETOOLS_SCOPE: paymentManagementScope,
    },
  });

export const keys = serverKeys;
