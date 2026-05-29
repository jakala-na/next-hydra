import { keys as analytics } from "@repo/analytics/keys";
import { keys as authWorkos } from "@repo/auth-workos/keys";
import { keys as commerce } from "@repo/commerce/keys";
import { keys as email } from "@repo/email/keys";
import { keys as core } from "@repo/next-config/keys";
import { keys as observability } from "@repo/observability/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const MIN_REGISTRATION_APPROVAL_SECRET_LENGTH = 16;
const MIN_WORKOS_WEBHOOK_SECRET_LENGTH = 1;

export const env = createEnv({
  extends: [
    analytics(),
    authWorkos(),
    commerce(),
    core(),
    email(),
    observability(),
  ],
  server: {
    REGISTRATION_APPROVAL_SECRET: z
      .string()
      .min(MIN_REGISTRATION_APPROVAL_SECRET_LENGTH),
    REGISTRATION_APPROVER_EMAIL: z.string().email(),
    WORKOS_WEBHOOK_SECRET: z.string().min(MIN_WORKOS_WEBHOOK_SECRET_LENGTH),
  },
  client: {},
  runtimeEnv: {
    REGISTRATION_APPROVAL_SECRET: process.env.REGISTRATION_APPROVAL_SECRET,
    REGISTRATION_APPROVER_EMAIL: process.env.REGISTRATION_APPROVER_EMAIL,
    WORKOS_WEBHOOK_SECRET: process.env.WORKOS_WEBHOOK_SECRET,
  },
});
