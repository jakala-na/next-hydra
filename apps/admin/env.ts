import { keys as auth } from "@repo/auth/keys";
import { keys as observability } from "@repo/observability/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
  },
  extends: [auth(), observability()],
  runtimeEnv: {
    ANALYZE: process.env.ANALYZE,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    VERCEL: process.env.VERCEL,
  },
  server: {
    ANALYZE: z.string().optional(),
    VERCEL: z.string().optional(),
  },
});
