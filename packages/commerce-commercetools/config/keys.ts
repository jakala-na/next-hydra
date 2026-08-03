import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const serverKeys = () =>
  createEnv({
    server: {
      COMMERCETOOLS_PROJECT_KEY: z.string().min(1),
      COMMERCETOOLS_CLIENT_ID: z.string().min(1),
      COMMERCETOOLS_CLIENT_SECRET: z.string().min(1),
      COMMERCETOOLS_SCOPE: z.string().min(1),
      COMMERCETOOLS_REGION: z.string().min(1),
    },
    runtimeEnv: {
      COMMERCETOOLS_PROJECT_KEY: process.env.COMMERCETOOLS_PROJECT_KEY,
      COMMERCETOOLS_CLIENT_ID: process.env.COMMERCETOOLS_CLIENT_ID,
      COMMERCETOOLS_CLIENT_SECRET: process.env.COMMERCETOOLS_CLIENT_SECRET,
      COMMERCETOOLS_SCOPE: process.env.COMMERCETOOLS_SCOPE,
      COMMERCETOOLS_REGION: process.env.COMMERCETOOLS_REGION,
    },
  });

export const keys = () =>
  createEnv({
    extends: [serverKeys()],
    client: {
      NEXT_PUBLIC_COMMERCETOOLS_PROJECT_KEY: z.string(),
      NEXT_PUBLIC_COMMERCETOOLS_REGION: z.string(),
    },
    runtimeEnv: {
      NEXT_PUBLIC_COMMERCETOOLS_PROJECT_KEY:
        process.env.NEXT_PUBLIC_COMMERCETOOLS_PROJECT_KEY,
      NEXT_PUBLIC_COMMERCETOOLS_REGION:
        process.env.NEXT_PUBLIC_COMMERCETOOLS_REGION,
    },
  });
