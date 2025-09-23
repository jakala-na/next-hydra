import 'server-only';

import type { CommerceAdapter } from '@repo/commerce-domain';

import { getCommerceConfig } from './config';

let adapterPromise: Promise<CommerceAdapter> | null = null;

async function loadAdapter(): Promise<CommerceAdapter> {
  const { provider } = getCommerceConfig();

  switch (provider) {
    case 'commercetools': {
      const { createCommerceAdapter } = await import(
        '@repo/commerce-commercetools'
      );
      return createCommerceAdapter();
    }
    default: {
      throw new Error(`Unsupported commerce provider: ${provider}`);
    }
  }
}

export function getCommerceAdapter(): Promise<CommerceAdapter> {
  if (!adapterPromise) {
    adapterPromise = loadAdapter();
  }

  return adapterPromise;
}
