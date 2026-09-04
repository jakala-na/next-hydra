import { keys as cms } from "@repo/cms/keys";
import { configurePortlessEnvironment } from "@repo/next-config/portless";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

configurePortlessEnvironment("web");

export const env = createEnv({
  client: {
    NEXT_PUBLIC_WEB_URL: z.string().url(),
  },
  extends: [cms()],
  runtimeEnv: {
    CMS_HOMEPAGE_SLUG: process.env.CMS_HOMEPAGE_SLUG,
    CMS_REVALIDATION_SECRET: process.env.CMS_REVALIDATION_SECRET,
    NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
    VERCEL_PROJECT_PRODUCTION_URL:
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
  },
  server: {
    CMS_HOMEPAGE_SLUG: z.string().trim().min(1).default("/"),
    CMS_REVALIDATION_SECRET: z.string().min(32).optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().trim().min(1).optional(),
  },
});
