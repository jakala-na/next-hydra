import {
  adminKeys as adminAuth,
  keys as auth,
  webhookKeys as authWebhook,
} from "@repo/auth/keys";
import { keys as commerce } from "@repo/commerce-provider/keys";
import { keys as email } from "@repo/email/keys";
import { configurePortlessEnvironment } from "@repo/next-config/portless";
import { keys as observability } from "@repo/observability/keys";
import { keys as payments } from "@repo/payments-stripe/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

configurePortlessEnvironment("api");

export const env = createEnv({
  client: { NEXT_PUBLIC_WEB_URL: z.string().url() },
  extends: [
    auth(),
    adminAuth(),
    authWebhook(),
    commerce(),
    email(),
    payments(),
    observability(),
  ],
  runtimeEnv: {
    ADMIN_URL: process.env.ADMIN_URL,
    ANALYZE: process.env.ANALYZE,
    NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
    REGISTRATION_APPROVER_EMAIL: process.env.REGISTRATION_APPROVER_EMAIL,
    VERCEL: process.env.VERCEL,
  },
  server: {
    ADMIN_URL: z.string().url(),
    ANALYZE: z.string().optional(),
    REGISTRATION_APPROVER_EMAIL: z.string().email(),
    VERCEL: z.string().optional(),
  },
});
