import { keys as auth } from "@repo/auth/keys";
import { keys as cms } from "@repo/cms/keys";
import { keys as commerce } from "@repo/commerce-provider/keys";
import { keys as email } from "@repo/email/keys";
import { keys as flags } from "@repo/feature-flags/keys";
import { keys as core } from "@repo/next-config/keys";
import { keys as observability } from "@repo/observability/keys";
import { keys as rateLimit } from "@repo/rate-limit/keys";
import { keys as security } from "@repo/security/keys";
import { createEnv } from "@t3-oss/env-nextjs";

import { webClientEnvFields, webCmsServerEnvFields } from "./env-schema";

export const env = createEnv({
  client: webClientEnvFields,
  extends: [
    auth(),
    cms(),
    commerce(),
    core(),
    email(),
    observability(),
    flags(),
    security(),
    rateLimit(),
  ],
  runtimeEnv: {
    CMS_HOMEPAGE_SLUG: process.env.CMS_HOMEPAGE_SLUG,
    CMS_REVALIDATION_SECRET: process.env.CMS_REVALIDATION_SECRET,
    NEXT_PUBLIC_ARCHITECTURE_OVERLAYS:
      process.env.NEXT_PUBLIC_ARCHITECTURE_OVERLAYS,
  },
  server: webCmsServerEnvFields,
});
