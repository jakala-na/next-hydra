import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    emptyStringAsUndefined: true,
    runtimeEnv: {
      ALGOLIA_ADMIN_API_KEY: process.env.ALGOLIA_ADMIN_API_KEY,
      ALGOLIA_APPLICATION_ID: process.env.ALGOLIA_APPLICATION_ID,
      ALGOLIA_INDEX_PREFIX: process.env.ALGOLIA_INDEX_PREFIX,
      ALGOLIA_REGION: process.env.ALGOLIA_REGION,
      ALGOLIA_SEARCH_API_KEY: process.env.ALGOLIA_SEARCH_API_KEY,
    },
    server: {
      ALGOLIA_ADMIN_API_KEY: z.string().trim().min(1).optional(),
      ALGOLIA_APPLICATION_ID: z.string().trim().min(1),
      ALGOLIA_INDEX_PREFIX: z
        .string()
        .trim()
        .min(1)
        .refine((value) => !value.includes("--"), {
          message: 'Must not contain the reserved "--" separator',
        })
        .optional(),
      ALGOLIA_REGION: z.enum(["eu", "us"]).optional(),
      ALGOLIA_SEARCH_API_KEY: z.string().trim().min(1),
    },
  });
