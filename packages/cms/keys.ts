import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const keys = () =>
  createEnv({
    server: {
      CONTENTSTACK_ENVIRONMENT: z.string(),
      CONTENTSTACK_API_KEY: z.string(),
      CONTENTSTACK_DELIVERY_TOKEN: z.string().startsWith('cs'),
      CONTENTSTACK_PREVIEW_TOKEN: z.string().startsWith('cs'),
      CONTENTSTACK_WEBHOOK_SECRET: z.string(),
    },
    client: {
      NEXT_PUBLIC_CONTENTSTACK_API_KEY: z.string(),
      NEXT_PUBLIC_CONTENTSTACK_ENVIRONMENT: z.string(),
    },
    runtimeEnv: {
      CONTENTSTACK_ENVIRONMENT: process.env.CONTENTSTACK_ENVIRONMENT,
      CONTENTSTACK_API_KEY: process.env.CONTENTSTACK_API_KEY,
      CONTENTSTACK_DELIVERY_TOKEN: process.env.CONTENTSTACK_DELIVERY_TOKEN,
      CONTENTSTACK_PREVIEW_TOKEN: process.env.CONTENTSTACK_PREVIEW_TOKEN,
      CONTENTSTACK_WEBHOOK_SECRET: process.env.CONTENTSTACK_WEBHOOK_SECRET,
      NEXT_PUBLIC_CONTENTSTACK_API_KEY:
        process.env.NEXT_PUBLIC_CONTENTSTACK_API_KEY,
      NEXT_PUBLIC_CONTENTSTACK_ENVIRONMENT:
        process.env.NEXT_PUBLIC_CONTENTSTACK_ENVIRONMENT,
    },
  });
