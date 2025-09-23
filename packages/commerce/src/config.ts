import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

const providerSchema = z.enum(['commercetools']);

type Provider = z.infer<typeof providerSchema>;

const env = createEnv({
  server: {
    COMMERCE_PROVIDER: providerSchema.default('commercetools'),
  },
  client: {},
  runtimeEnv: {
    COMMERCE_PROVIDER: process.env.COMMERCE_PROVIDER,
  },
});

export type CommerceProvider = Provider;

export function getCommerceConfig(): { provider: CommerceProvider } {
  return { provider: env.COMMERCE_PROVIDER };
}
