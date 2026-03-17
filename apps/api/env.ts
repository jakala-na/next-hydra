import { keys as analytics } from "@repo/analytics/keys";
import { keys as authWorkos } from "@repo/auth-workos/keys";
import { keys as commerce } from "@repo/commerce/keys";
import { keys as email } from "@repo/email/keys";
import { keys as core } from "@repo/next-config/keys";
import { keys as observability } from "@repo/observability/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

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
    REGISTRATION_APPROVAL_SECRET: z.string().min(16),
    WORKOS_WEBHOOK_SECRET: z.string().min(1),
  },
  client: {},
  runtimeEnv: {
    REGISTRATION_APPROVAL_SECRET: process.env.REGISTRATION_APPROVAL_SECRET,
    WORKOS_WEBHOOK_SECRET: process.env.WORKOS_WEBHOOK_SECRET,
  },
});
