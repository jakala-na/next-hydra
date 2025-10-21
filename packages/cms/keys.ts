import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const keys = () =>
  createEnv({
    server: {
      UNIFORM_API_KEY: z.string(),
      UNIFORM_PROJECT_ID: z.string(),
      UNIFORM_PREVIEW_SECRET: z.string(),
    },
    client: {

    },
    runtimeEnv: {
      UNIFORM_API_KEY: process.env.UNIFORM_API_KEY,
      UNIFORM_PROJECT_ID: process.env.UNIFORM_PROJECT_ID,
      UNIFORM_PREVIEW_SECRET: process.env.UNIFORM_PREVIEW_SECRET,
    },
  });
