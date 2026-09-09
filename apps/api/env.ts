import { configurePortlessEnvironment } from "@repo/next-config/portless";
import { keys as observability } from "@repo/observability/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

configurePortlessEnvironment("api");

export const env = createEnv({
  client: {},
  extends: [observability()],
  runtimeEnv: {
    ANALYZE: process.env.ANALYZE,
    VERCEL: process.env.VERCEL,
  },
  server: {
    ANALYZE: z.string().optional(),
    VERCEL: z.string().optional(),
  },
});
