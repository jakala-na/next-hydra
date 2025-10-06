import 'server-only';

import {
  provider as adapterProvider,
  createCommerceAdapter,
} from '@repo/commerce-adapter';

import type { CommerceAdapter } from '@repo/commerce-domain';

import { getCommerceConfig } from './config';

let adapter: CommerceAdapter | null = null;

function resolveAdapter(): CommerceAdapter {
  const { provider } = getCommerceConfig();

  if (provider !== adapterProvider) {
    throw new Error(
      `Configured commerce provider "${provider}" does not match installed adapter "${adapterProvider}". ` +
        'Update COMMERCE_PROVIDER or the @repo/commerce-adapter alias to resolve this mismatch.'
    );
  }

  return createCommerceAdapter();
}

export function getCommerceAdapter(): Promise<CommerceAdapter> {
  if (!adapter) {
    adapter = resolveAdapter();
  }

  return Promise.resolve(adapter);
}
