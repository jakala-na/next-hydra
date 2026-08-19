import { keys as analytics } from "@repo/analytics/keys";
import { keys as auth, webhookKeys as authWebhook } from "@repo/auth/keys";
import { keys as commerce } from "@repo/commerce-provider/keys";
import { keys as email } from "@repo/email/keys";
import { keys as core } from "@repo/next-config/keys";
import { keys as observability } from "@repo/observability/keys";
import { createEnv } from "@t3-oss/env-nextjs";

import { apiServerEnvFields } from "./env-schema";

export const env = createEnv({
  client: {},
  extends: [
    analytics(),
    auth(),
    authWebhook(),
    commerce(),
    core(),
    email(),
    observability(),
  ],
  runtimeEnv: {
    REGISTRATION_APPROVER_EMAIL: process.env.REGISTRATION_APPROVER_EMAIL,
  },
  server: apiServerEnvFields,
});
