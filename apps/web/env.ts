import { keys as authWorkos } from "@repo/auth-workos/keys";
import { keys as cms } from "@repo/cms/keys";
import { keys as commerce } from "@repo/commerce/keys";
import { keys as email } from "@repo/email/keys";
import { keys as flags } from "@repo/feature-flags/keys";
import { keys as core } from "@repo/next-config/keys";
import { keys as observability } from "@repo/observability/keys";
import { keys as rateLimit } from "@repo/rate-limit/keys";
import { keys as security } from "@repo/security/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  extends: [
    authWorkos(),
    cms(),
    commerce(),
    core(),
    email(),
    observability(),
    flags(),
    security(),
    rateLimit(),
  ],
  server: {
    REGISTRATION_APPROVAL_SECRET: z.string().min(16).optional(),
  },
  client: {},
  runtimeEnv: {
    REGISTRATION_APPROVAL_SECRET: process.env.REGISTRATION_APPROVAL_SECRET,
  },
});
